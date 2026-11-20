-- name: OpenAttendanceSession :one
-- Idempotent open: a second call for the same (schedule_id, date) returns
-- no row from the INSERT and the caller falls back to GetAttendanceSessionBySchedule.
insert into attendance_sessions (
  tenant_id, academic_year_id, schedule_id, date, class_id, subject_id, teacher_user_id,
  substitute_user_id, start_period_id, end_period_id
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
on conflict (schedule_id, date) do nothing
returning *;

-- name: FillAttendanceSessionSubstitute :one
-- Records the accepted substitute on a session first opened without one
-- (the original teacher's list opened it before the substitute's did), so
-- the row names who teaches it whoever opens it first. Never overwrites a
-- substitute already recorded.
update attendance_sessions set substitute_user_id = $3
where tenant_id = $1 and id = $2 and substitute_user_id is null
returning *;

-- name: GetAttendanceSessionBySchedule :one
select * from attendance_sessions where tenant_id = $1 and schedule_id = $2 and date = $3;

-- name: GetAttendanceSessionByID :one
select * from attendance_sessions where tenant_id = $1 and id = $2;

-- name: SubmitAttendanceSession :one
update attendance_sessions
set submitted_at = now(), submitted_by = $3, notes = $4
where tenant_id = $1 and id = $2
returning *;

-- name: ListAttendanceSessionsByClassDate :many
select * from attendance_sessions where tenant_id = $1 and class_id = $2 and date = $3 order by created_at;

-- name: ListAttendanceSessionsByTeacherDate :many
select * from attendance_sessions
where tenant_id = $1 and date = $2 and (teacher_user_id = $3 or substitute_user_id = $3)
order by created_at;

-- name: ListAttendanceSessionsByDateRange :many
select * from attendance_sessions
where tenant_id = $1 and academic_year_id = $2 and date between $3 and $4
order by date, created_at;

-- name: CountSubmittedSessionsByClassDate :one
select count(*)::bigint from attendance_sessions
where tenant_id = $1 and class_id = $2 and date = $3 and submitted_at is not null;

-- name: CountHeldAttendanceMeetingsBeforeDate :one
-- The input to "meeting_number" in the session payload: how many earlier
-- meetings of this class and subject were actually held (submitted) this
-- year, across every weekday's schedule row, so meeting_number = count + 1.
-- A session opened only by browsing the list is not a meeting.
select count(*)::bigint from attendance_sessions
where tenant_id = $1 and academic_year_id = $2 and class_id = $3 and subject_id = $4
  and date < $5 and submitted_at is not null;

-- name: CountSubmittedSessionsByClassesDates :many
-- Batch form of CountSubmittedSessionsByClassDate: how many of each
-- (class, date)'s sessions have been submitted. A pair with no session at
-- all is absent from the result (count 0).
select class_id, date, (count(*) filter (where submitted_at is not null))::bigint as submitted
from attendance_sessions
where tenant_id = $1 and class_id = any(sqlc.arg(class_ids)::uuid[]) and date = any(sqlc.arg(dates)::date[])
group by class_id, date;
