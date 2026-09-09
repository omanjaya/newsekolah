create table push_devices (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null,
  platform text not null check (platform in ('web', 'ios', 'android')),
  token_or_endpoint text not null,
  endpoint_hash bytea not null unique,
  p256dh text,
  auth_key text,
  device_name text,
  failure_count integer not null default 0,
  last_used_at timestamptz,
  expires_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index ix_push_devices_tenant_id on push_devices (tenant_id);
create index ix_push_devices_user_id on push_devices (user_id);
create index ix_push_devices_expires_at on push_devices (expires_at);

alter table push_devices enable row level security;
alter table push_devices force row level security;

create policy tenant_isolation on push_devices
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
