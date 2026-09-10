-- Staff attendance (docs/12-roadmap.md Fase 6, "absensi pegawai"): the
-- working attendance of teachers and staff, kept separate from
-- attendance_sessions/attendance_entries, which record teaching attendance
-- per lesson for a different subject entirely (a student's presence in
-- one class period, not an employee's presence at work).
--
-- staff_attendance_schedules is this module's own roster: an employee only
-- appears in the daily board and reports once an administrator has set at
-- least one working day for them here, so there is no dependency on a
-- second, module-external notion of "who counts as staff".
create table staff_attendance_schedules (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  employee_user_id uuid not null references users (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  is_working_day boolean not null default true,
  start_minute smallint not null default 0 check (start_minute between 0 and 1439),
  end_minute smallint not null default 0 check (end_minute between 0 and 1439),
  grace_minutes smallint not null default 0 check (grace_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  unique (tenant_id, employee_user_id, weekday)
);

create index ix_staff_attendance_schedules_employee
  on staff_attendance_schedules (tenant_id, employee_user_id);

alter table staff_attendance_schedules enable row level security;
alter table staff_attendance_schedules force row level security;

create policy tenant_isolation on staff_attendance_schedules
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_staff_attendance_schedules_set_updated_at
  before update on staff_attendance_schedules
  for each row execute function set_updated_at();

-- One row per employee per calendar date. source records how the row was
-- populated; status_code is recomputed server-side from the schedule, the
-- academic calendar, and permits leave every time arrival/departure change,
-- never entered by hand, so it can never drift from the rule that produced
-- it (apps/api/internal/modules/staffattendance/domain's lateness function).
create table staff_attendance_records (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  employee_user_id uuid not null references users (id) on delete cascade,
  date date not null,
  arrival_at timestamptz,
  departure_at timestamptz,
  status_code text not null check (
    status_code in ('present', 'late', 'absent', 'on_leave', 'holiday', 'incomplete')
  ),
  late_minutes int not null default 0 check (late_minutes >= 0),
  early_leave_minutes int not null default 0 check (early_leave_minutes >= 0),
  source text not null check (source in ('qr', 'manual', 'import')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  unique (tenant_id, employee_user_id, date)
);

create index ix_staff_attendance_records_tenant_date
  on staff_attendance_records (tenant_id, date);
create index ix_staff_attendance_records_employee_date
  on staff_attendance_records (tenant_id, employee_user_id, date);

alter table staff_attendance_records enable row level security;
alter table staff_attendance_records force row level security;

create policy tenant_isolation on staff_attendance_records
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_staff_attendance_records_set_updated_at
  before update on staff_attendance_records
  for each row execute function set_updated_at();

-- Every administrator correction to a record, kept forever (no update/delete
-- of this table from application code): who changed it, why, and the full
-- before/after snapshot, satisfying "every correction keeps who changed it
-- and why" without overloading staff_attendance_records itself with audit
-- columns that would only ever hold the most recent change.
create table staff_attendance_corrections (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  record_id uuid not null references staff_attendance_records (id) on delete cascade,
  reason text not null check (length(reason) > 0),
  previous_snapshot jsonb not null,
  new_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references users (id) on delete restrict
);

create index ix_staff_attendance_corrections_record
  on staff_attendance_corrections (tenant_id, record_id, created_at desc);

alter table staff_attendance_corrections enable row level security;
alter table staff_attendance_corrections force row level security;

create policy tenant_isolation on staff_attendance_corrections
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
