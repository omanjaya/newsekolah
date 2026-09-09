-- Onboarding wizard: a log of every Dapodik import commit (docs/12-roadmap.md
-- Fase 3). Level templates and sample-data seeding create rows the existing
-- academic/identity tables already own (grade_levels, subjects, periods,
-- classes, users) and need no schema of their own; this table exists so an
-- admin can see when a Dapodik file was last committed and what it did,
-- without re-deriving that from users.created_at across a whole roster.
create table dapodik_import_batches (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  row_count integer not null,
  created_count integer not null,
  updated_count integer not null,
  error_count integer not null,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  check (row_count >= 0),
  check (created_count >= 0),
  check (updated_count >= 0),
  check (error_count >= 0)
);

create index ix_dapodik_import_batches_tenant_id on dapodik_import_batches (tenant_id);

alter table dapodik_import_batches enable row level security;
alter table dapodik_import_batches force row level security;
create policy tenant_isolation on dapodik_import_batches
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
