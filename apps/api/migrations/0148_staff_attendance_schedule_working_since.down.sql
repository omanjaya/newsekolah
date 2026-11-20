-- Back to one date per row: a working row is dated from when it last
-- became a working day, as the rule before 0148 kept it.
alter table staff_attendance_schedules disable trigger trg_staff_attendance_schedules_set_updated_at;
update staff_attendance_schedules set created_at = working_since where working_since is not null;
alter table staff_attendance_schedules enable trigger trg_staff_attendance_schedules_set_updated_at;

alter table staff_attendance_schedules
  drop constraint if exists ck_staff_attendance_schedules_working_since,
  drop column if exists working_since;
