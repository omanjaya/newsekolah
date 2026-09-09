create table attendance_entries (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  session_id uuid not null references attendance_sessions (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  -- status_code is validated against tenant_policies(kind='attendance_statuses')
  -- in the service layer, not a CHECK: the code catalog is configurable per
  -- tenant (docs/02-system-design.md section 4.3), default H/S/I/D/A.
  status_code text not null check (length(status_code) <= 10),
  source text not null default 'teacher' check (source in ('teacher', 'leave', 'permit', 'system')),
  notes text,
  recorded_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_user_id)
);

create index ix_attendance_entries_tenant_id on attendance_entries (tenant_id);
create index ix_attendance_entries_session_id on attendance_entries (session_id);
create index ix_attendance_entries_student_created on attendance_entries (student_user_id, created_at);

alter table attendance_entries enable row level security;
alter table attendance_entries force row level security;

create policy tenant_isolation on attendance_entries
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_attendance_entries_set_updated_at
  before update on attendance_entries
  for each row execute function set_updated_at();
