-- Photo evidence on violation records, mirroring counseling_attachments
-- (0056_discipline.up.sql): an asset row plus which record it belongs to.
create table violation_attachments (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  violation_record_id uuid not null references violation_records (id) on delete cascade,
  asset_id uuid not null references assets (id),
  created_at timestamptz not null default now()
);
create index ix_violation_attachments_tenant_id on violation_attachments (tenant_id);
create index ix_violation_attachments_record on violation_attachments (violation_record_id);
alter table violation_attachments enable row level security;
alter table violation_attachments force row level security;
create policy tenant_isolation on violation_attachments
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
