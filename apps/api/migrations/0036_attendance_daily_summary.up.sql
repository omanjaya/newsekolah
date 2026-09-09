-- Materialized by the attendance service inside the same transaction as
-- every session submit (docs/06-database-schema.md section 6): one row per
-- student per day, computed by the single daily-status algorithm in
-- attendance/domain so the student calendar, homeroom view, daily report,
-- and monitor snapshot never disagree.
create table attendance_daily_summary (
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  date date not null,
  status_code text not null,
  expected_sessions int not null default 0 check (expected_sessions >= 0),
  submitted_sessions int not null default 0 check (submitted_sessions >= 0),
  computed_at timestamptz not null default now(),
  primary key (academic_year_id, student_user_id, date)
);

create index ix_attendance_daily_summary_tenant_id on attendance_daily_summary (tenant_id, date);
create index ix_attendance_daily_summary_student_id on attendance_daily_summary (student_user_id, date);

alter table attendance_daily_summary enable row level security;
alter table attendance_daily_summary force row level security;

create policy tenant_isolation on attendance_daily_summary
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
