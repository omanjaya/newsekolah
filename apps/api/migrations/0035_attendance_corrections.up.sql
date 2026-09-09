create table attendance_corrections (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  entry_id uuid not null references attendance_entries (id) on delete cascade,
  old_status text not null,
  new_status text not null,
  reason text not null check (length(reason) <= 500),
  corrected_by uuid not null references users (id) on delete restrict,
  corrected_at timestamptz not null default now()
);

create index ix_attendance_corrections_tenant_id on attendance_corrections (tenant_id);
create index ix_attendance_corrections_entry_id on attendance_corrections (entry_id, corrected_at desc);

alter table attendance_corrections enable row level security;
alter table attendance_corrections force row level security;

create policy tenant_isolation on attendance_corrections
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
