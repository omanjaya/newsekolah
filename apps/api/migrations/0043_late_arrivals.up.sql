create table late_arrivals (
  instance_id uuid primary key references workflow_instances (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  reason text not null default 'Terlambat datang ke sekolah' check (length(reason) <= 500),
  -- Bug fix vs. the old app (docs/analysis/database-inventory.md 1.5):
  -- occurrence_number is computed once at creation from a real per-year
  -- count, not COUNT(*)+1 recomputed (and racy) on every read.
  occurrence_number int not null check (occurrence_number > 0),
  required_action text not null default 'none' check (required_action in ('none', 'call_parent', 'send_home')),
  homeroom_reported boolean not null default false,
  completed_at timestamptz
);

create index ix_late_arrivals_tenant_id on late_arrivals (tenant_id);

alter table late_arrivals enable row level security;
alter table late_arrivals force row level security;

create policy tenant_isolation on late_arrivals
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
