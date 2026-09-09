create extension if not exists pgcrypto;
create extension if not exists citext;

-- UUIDv7 (RFC 9562): 48-bit millisecond timestamp followed by random bits,
-- so primary keys sort by creation time without a separate created_at index.
-- Postgres 16 has no native generator, so it is implemented here in PL/pgSQL.
create or replace function uuidv7() returns uuid
language plpgsql volatile as $$
begin
  return encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
                placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
                from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex')::uuid;
end
$$;

-- The only trigger function in the schema: bumps updated_at on every row
-- update. All other business rules live in the service layer, not in SQL.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create table tenants (
  id uuid primary key default uuidv7(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  name text not null check (length(name) <= 150),
  education_level text not null check (education_level in ('sd', 'smp', 'sma', 'smk', 'other')),
  timezone text not null default 'Asia/Makassar',
  locale text not null default 'id' check (locale in ('id', 'en')),
  status text not null default 'trial' check (status in ('trial', 'active', 'suspended', 'offboarding', 'deleted')),
  plan text not null default 'default',
  primary_domain text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_tenants_set_updated_at
  before update on tenants
  for each row execute function set_updated_at();

create table tenant_domains (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  domain text not null unique,
  is_primary boolean not null default false,
  verified_at timestamptz,
  verification_token text not null,
  created_at timestamptz not null default now()
);

create index ix_tenant_domains_tenant_id on tenant_domains (tenant_id);

create table tenant_settings (
  tenant_id uuid not null references tenants (id) on delete cascade,
  key text not null check (length(key) <= 150),
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

alter table tenant_settings enable row level security;
alter table tenant_settings force row level security;

create policy tenant_isolation on tenant_settings
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create policy platform_access on tenant_settings
  using (current_setting('app.platform_admin', true) = 'true')
  with check (current_setting('app.platform_admin', true) = 'true');

create table tenant_policies (
  tenant_id uuid not null references tenants (id) on delete cascade,
  kind text not null check (kind in (
    'attendance_statuses', 'discipline_levels', 'late_arrival_actions', 'grading', 'calendar', 'permits', 'document_numbering'
  )),
  version int not null check (version > 0),
  config jsonb not null,
  effective_from date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (tenant_id, kind, version)
);

alter table tenant_policies enable row level security;
alter table tenant_policies force row level security;

create policy tenant_isolation on tenant_policies
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create policy platform_access on tenant_policies
  using (current_setting('app.platform_admin', true) = 'true')
  with check (current_setting('app.platform_admin', true) = 'true');

create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table platform_admins (
  user_id uuid primary key,
  granted_at timestamptz not null default now(),
  granted_by uuid
);

create table feature_flags (
  tenant_id uuid not null references tenants (id) on delete cascade,
  module text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  primary key (tenant_id, module)
);

alter table feature_flags enable row level security;
alter table feature_flags force row level security;

create policy tenant_isolation on feature_flags
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create policy platform_access on feature_flags
  using (current_setting('app.platform_admin', true) = 'true')
  with check (current_setting('app.platform_admin', true) = 'true');

create table assets (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  bucket text not null,
  object_key text not null unique,
  mime text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null,
  kind text not null check (kind in ('avatar', 'branding', 'evidence', 'document', 'cover', 'import', 'export')),
  visibility text not null check (visibility in ('private', 'tenant_public')),
  created_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index ix_assets_tenant_id on assets (tenant_id);

alter table assets enable row level security;
alter table assets force row level security;

create policy tenant_isolation on assets
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create policy platform_access on assets
  using (current_setting('app.platform_admin', true) = 'true')
  with check (current_setting('app.platform_admin', true) = 'true');

-- Append-only, partitioned monthly; a default partition absorbs any month
-- without an explicit partition until the maintenance job creates the next
-- one. tenant_id is nullable for platform-level actions (e.g. tenant offboarding).
create table audit_logs (
  id uuid not null default uuidv7(),
  tenant_id uuid references tenants (id) on delete set null,
  actor_user_id uuid,
  acting_as_user_id uuid,
  action text not null check (length(action) <= 150),
  entity_type text not null check (length(entity_type) <= 100),
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip inet,
  user_agent text,
  request_id text,
  occurred_at timestamptz not null default now(),
  primary key (id, occurred_at)
) partition by range (occurred_at);

create table audit_logs_default partition of audit_logs default;

create index ix_audit_logs_tenant_id on audit_logs (tenant_id, occurred_at desc);
create index ix_audit_logs_entity on audit_logs (entity_type, entity_id);

alter table audit_logs enable row level security;
alter table audit_logs force row level security;

create policy tenant_isolation on audit_logs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create policy platform_access on audit_logs
  using (current_setting('app.platform_admin', true) = 'true')
  with check (current_setting('app.platform_admin', true) = 'true');
