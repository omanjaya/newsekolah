create table announcements (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  sender_user_id uuid not null,
  title text not null check (length(title) <= 180),
  body_html text not null,
  body_text text not null,
  audience jsonb not null,
  is_pinned boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  published_at timestamptz,
  recipient_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index ix_announcements_tenant_id on announcements (tenant_id);
create index ix_announcements_tenant_status on announcements (tenant_id, status);
create index ix_announcements_tenant_pinned on announcements (tenant_id, is_pinned, starts_at desc);

alter table announcements enable row level security;
alter table announcements force row level security;

create policy tenant_isolation on announcements
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_announcements_set_updated_at
  before update on announcements
  for each row execute function set_updated_at();
