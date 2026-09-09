-- Platform console: tenant export jobs (docs/12-roadmap.md Fase 3, platform
-- console). Tenant CRUD, suspend/resume, and custom domain reuse the
-- existing `tenants` and `tenant_domains` tables from 0001_platform_core;
-- module feature flags reuse the existing `feature_flags` table. Only the
-- export job's own bookkeeping needs a new table.
create table tenant_exports (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  object_key text not null default '',
  error_message text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index ix_tenant_exports_tenant_id on tenant_exports (tenant_id, created_at desc);

alter table tenant_exports enable row level security;
alter table tenant_exports force row level security;

create policy tenant_isolation on tenant_exports
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create policy platform_access on tenant_exports
  using (current_setting('app.platform_admin', true) = 'true')
  with check (current_setting('app.platform_admin', true) = 'true');
