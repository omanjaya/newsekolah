create table attendance_sessions (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  schedule_id uuid not null references schedules (id) on delete cascade,
  date date not null,
  class_id uuid not null references classes (id) on delete restrict,
  subject_id uuid not null references subjects (id) on delete restrict,
  teacher_user_id uuid not null references users (id) on delete restrict,
  substitute_user_id uuid references users (id) on delete set null,
  start_period_id uuid not null references periods (id) on delete restrict,
  end_period_id uuid not null references periods (id) on delete restrict,
  notes text,
  submitted_at timestamptz,
  submitted_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, date)
);

create index ix_attendance_sessions_tenant_id on attendance_sessions (tenant_id, academic_year_id, date);
create index ix_attendance_sessions_class_date on attendance_sessions (class_id, date);
create index ix_attendance_sessions_teacher_date on attendance_sessions (teacher_user_id, date);
create index ix_attendance_sessions_substitute on attendance_sessions (substitute_user_id, date);
create index ix_attendance_sessions_start_period_id on attendance_sessions (start_period_id);
create index ix_attendance_sessions_end_period_id on attendance_sessions (end_period_id);

alter table attendance_sessions enable row level security;
alter table attendance_sessions force row level security;

create policy tenant_isolation on attendance_sessions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_attendance_sessions_set_updated_at
  before update on attendance_sessions
  for each row execute function set_updated_at();
