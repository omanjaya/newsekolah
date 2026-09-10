-- name: UpsertStaffAttendanceScheduleDay :one
insert into staff_attendance_schedules (
  tenant_id, employee_user_id, weekday, is_working_day, start_minute, end_minute, grace_minutes, created_by, updated_by
)
values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
on conflict (tenant_id, employee_user_id, weekday) do update set
  is_working_day = excluded.is_working_day,
  start_minute = excluded.start_minute,
  end_minute = excluded.end_minute,
  grace_minutes = excluded.grace_minutes,
  updated_by = excluded.updated_by
returning *;

-- name: ListStaffAttendanceScheduleDays :many
select * from staff_attendance_schedules
where tenant_id = $1 and employee_user_id = $2
order by weekday;

-- name: ListStaffAttendanceRosterEmployees :many
-- The module's own roster: every user who has at least one schedule day
-- configured, per apps/api/migrations/0070_staff_attendance.up.sql's
-- header note that the schedule table is the source of "who counts as
-- staff" for this module.
select distinct u.id, u.name
from staff_attendance_schedules s
join users u on u.id = s.employee_user_id
where s.tenant_id = $1
order by u.name;
