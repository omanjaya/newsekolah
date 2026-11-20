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

-- name: ListStaffAttendanceRecapEmployees :many
-- Everyone a monthly recap covers: the roster above plus anyone with a
-- record in [from_date, to_date) -- a check-in, manual entry or import made
-- before that person was given a work schedule is still a real record the
-- recap must not drop.
select u.id, u.name
from users u
where u.tenant_id = sqlc.arg(tenant_id)
  and (
    exists (
      select 1 from staff_attendance_schedules s
      where s.tenant_id = u.tenant_id and s.employee_user_id = u.id
    )
    or exists (
      select 1 from staff_attendance_records r
      where r.tenant_id = u.tenant_id and r.employee_user_id = u.id
        and r.date >= sqlc.arg(from_date) and r.date < sqlc.arg(to_date)
    )
  )
order by u.name;

-- name: ListStaffAttendanceCandidates :many
-- Everyone the schedule editor, manual entry, recap and import pickers may
-- choose: active users with a teacher or staff profile, the same
-- eligibility identity's ListStaffOptions uses, with no row cap. The
-- roster above cannot feed those pickers, since nobody is on it until a
-- schedule exists; has_schedule tells the two sets apart.
select u.id, u.name,
  exists(
    select 1 from staff_attendance_schedules s
    where s.tenant_id = u.tenant_id and s.employee_user_id = u.id
  )::boolean as has_schedule
from users u
where u.tenant_id = $1
  and u.deleted_at is null
  and u.status = 'active'
  and exists (
    select 1 from user_profiles up
    where up.user_id = u.id and up.kind in ('teacher', 'staff')
  )
order by u.name;

-- name: IsStaffAttendanceCandidate :one
-- A work schedule may only be given to an active user with a teacher or
-- staff profile.
select exists(
  select 1 from users u
  join user_profiles up on up.user_id = u.id and up.kind in ('teacher', 'staff')
  where u.tenant_id = $1 and u.id = $2
    and u.deleted_at is null
    and u.status = 'active'
)::boolean;
