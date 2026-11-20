-- A staff schedule row has two dates. created_at is when the weekday
-- first had a row at all: before it the employee had no schedule for that
-- weekday (unscheduled). working_since is when the weekday last turned
-- into a working day: between the two, the weekday was a configured day
-- off (holiday), not a gap in the configuration. Before this column,
-- created_at was re-dated when a day off became a working day, which
-- turned that weekday's earlier days off into "no schedule".
--
-- working_since is null while the weekday is a day off.
alter table staff_attendance_schedules add column working_since timestamptz;

-- A working row has been working since its created_at. A row re-dated by
-- the old rule gets its first-save date back: the editor saves all seven
-- weekdays at once, so the employee's earliest row dates the first save.
-- updated_at is left alone: nothing about the schedule changed.
alter table staff_attendance_schedules disable trigger trg_staff_attendance_schedules_set_updated_at;
update staff_attendance_schedules set working_since = created_at where is_working_day;
update staff_attendance_schedules s set created_at = first.created_at
  from (
    select tenant_id, employee_user_id, min(created_at) as created_at
    from staff_attendance_schedules
    group by tenant_id, employee_user_id
  ) first
  where first.tenant_id = s.tenant_id
    and first.employee_user_id = s.employee_user_id
    and s.is_working_day
    and s.created_at > first.created_at;
alter table staff_attendance_schedules enable trigger trg_staff_attendance_schedules_set_updated_at;

alter table staff_attendance_schedules
  add constraint ck_staff_attendance_schedules_working_since
    check (is_working_day = (working_since is not null));
