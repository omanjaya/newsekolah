-- Integrations module (docs/12-roadmap.md Fase 5): machine access to the
-- API via named API keys with an explicit, bounded permission subset, and
-- outgoing webhook endpoints delivered as River jobs with retry history.

create table integration_api_keys (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  secret_hash text not null,
  -- The permission subset the key was created with. It can never exceed
  -- created_by's own effective permissions at creation time (enforced in
  -- the service layer, not here: permissions are code, not a table this
  -- constraint could join against).
  permissions text[] not null check (cardinality(permissions) > 0),
  created_by uuid not null references users (id),
  ip_allowlist text[] not null default '{}'::text[],
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute between 1 and 6000),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_integration_api_keys_tenant_id on integration_api_keys (tenant_id);
create index ix_integration_api_keys_tenant_active on integration_api_keys (tenant_id, id) where revoked_at is null;
alter table integration_api_keys enable row level security;
alter table integration_api_keys force row level security;
create policy tenant_isolation on integration_api_keys
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_integration_api_keys_set_updated_at before update on integration_api_keys
  for each row execute function set_updated_at();

create table integration_webhook_endpoints (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  url text not null check (length(url) between 1 and 2048),
  description text not null default '' check (length(description) <= 500),
  event_types text[] not null check (cardinality(event_types) > 0),
  -- AES-256-GCM ciphertext of the HMAC signing secret (platform/crypto
  -- Sealer): unlike an api key secret this must be readable again, to sign
  -- every delivery, so it is encrypted at rest rather than hashed.
  signing_secret_ciphertext bytea not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  disabled_reason text not null default '' check (length(disabled_reason) <= 500),
  consecutive_failures integer not null default 0,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_integration_webhook_endpoints_tenant_id on integration_webhook_endpoints (tenant_id);
create index ix_integration_webhook_endpoints_tenant_active on integration_webhook_endpoints (tenant_id) where status = 'active';
alter table integration_webhook_endpoints enable row level security;
alter table integration_webhook_endpoints force row level security;
create policy tenant_isolation on integration_webhook_endpoints
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_integration_webhook_endpoints_set_updated_at before update on integration_webhook_endpoints
  for each row execute function set_updated_at();

create table integration_webhook_deliveries (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  endpoint_id uuid not null references integration_webhook_endpoints (id) on delete cascade,
  event_type text not null,
  event_id uuid not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  attempt_count integer not null default 0,
  last_status_code integer,
  last_error text not null default '' check (length(last_error) <= 2000),
  delivered_at timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now()
);
create index ix_integration_webhook_deliveries_tenant_id on integration_webhook_deliveries (tenant_id);
create index ix_integration_webhook_deliveries_endpoint on integration_webhook_deliveries (tenant_id, endpoint_id, created_at desc);
alter table integration_webhook_deliveries enable row level security;
alter table integration_webhook_deliveries force row level security;
create policy tenant_isolation on integration_webhook_deliveries
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
