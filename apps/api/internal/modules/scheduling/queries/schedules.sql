-- A schedule row is one version of a weekly lesson, on the timetable from
-- effective_from through effective_until (both inclusive; null until means
-- to the end of the academic year), per migration 0147. Every read that
-- asks "which lessons are there on date D" filters effective_range @> D.

-- name: CreateSchedule :one
insert into schedules (
  tenant_id, academic_year_id, term_id, class_id, subject_id, teacher_user_id, room_id,
  day_of_week, start_period_id, end_period_id, start_seq, end_seq, source, notes, created_by, updated_by,
  effective_from, effective_until
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15,
  sqlc.arg(effective_from)::date, sqlc.narg(effective_until)::date
)
returning *;

-- name: GetScheduleByID :one
select * from schedules where tenant_id = $1 and id = $2 for update;

-- name: UpdateSchedule :one
update schedules set
  term_id = $3, class_id = $4, subject_id = $5, teacher_user_id = $6, room_id = $7,
  day_of_week = $8, start_period_id = $9, end_period_id = $10, start_seq = $11, end_seq = $12,
  source = $13, notes = $14, updated_by = $15,
  effective_from = sqlc.arg(effective_from)::date, effective_until = sqlc.narg(effective_until)::date
where tenant_id = $1 and id = $2
returning *;

-- name: RetireSchedule :one
-- Ends one version on effective_until (its last lesson date): the row and
-- everything recorded against it stay, it simply no longer occurs later.
update schedules set effective_until = sqlc.arg(effective_until)::date, updated_by = $3
where tenant_id = $1 and id = $2
returning *;

-- name: DeleteSchedule :exec
delete from schedules where tenant_id = $1 and id = $2;

-- name: DeleteSchedulesByAcademicYear :exec
delete from schedules where tenant_id = $1 and academic_year_id = $2;

-- name: ListSchedulesByAcademicYear :many
-- Every version of the year, locked for an effective-dated clear.
select * from schedules where tenant_id = $1 and academic_year_id = $2
order by day_of_week, start_seq, id
for update;

-- name: ListSchedulesByClassForWeek :many
-- A class's timetable for the Monday-Sunday week starting week_start: each
-- weekday lists the versions in effect on that weekday's own date, so a
-- change that starts mid-week shows the old lesson before it and the new
-- one from it.
select * from schedules
where tenant_id = $1 and academic_year_id = $2 and class_id = $3
  and effective_range @> (sqlc.arg(week_start)::date + (day_of_week - 1)::int)
order by day_of_week, start_seq;

-- name: ListSchedulesByTeacherForWeek :many
-- ListSchedulesByClassForWeek for one teacher.
select * from schedules
where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3
  and effective_range @> (sqlc.arg(week_start)::date + (day_of_week - 1)::int)
order by day_of_week, start_seq;

-- name: ListSchedulesByDayOn :many
-- Every class's lessons on one date (the per-day grid).
select * from schedules
where tenant_id = $1 and academic_year_id = $2 and day_of_week = $3
  and effective_range @> sqlc.arg(on_date)::date
order by start_seq;

-- name: ListSchedulesByDay :many
-- Every version of one weekday, whatever its dates: the conflict check
-- reads this and domain.DetectConflict compares only versions whose
-- effective ranges overlap, the way the exclusion constraints do.
select * from schedules
where tenant_id = $1 and academic_year_id = $2 and day_of_week = $3
order by start_seq;

-- name: ListSchedulesForTeacherOn :many
-- A teacher's own lessons on one date: the version of each lesson in
-- effect that day, on that date's weekday.
select * from schedules
where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3
  and day_of_week = extract(isodow from sqlc.arg(on_date)::date)::smallint
  and effective_range @> sqlc.arg(on_date)::date
order by start_seq;

-- name: ListScheduleHistory :many
-- Which of the given schedules have history -- a recorded attendance
-- session (submitted, or holding an entry or a journal), any substitution
-- request, or a supervision visit planned for it (done or not) -- and the
-- last date it binds: the latest recorded session, pending/accepted
-- substitution or visit. A change on such a version must take effect after
-- that date (migration 0147's history guard for sessions and
-- substitutions; the service alone for visits, whose schedule_id has no
-- foreign key), and it is never rewritten in place or deleted; a session
-- only opened, with nothing recorded, is a placeholder and binds nothing.
select s.id,
  greatest(
    (select max(a.date) from attendance_sessions a
     where a.schedule_id = s.id and attendance_session_recorded(a.id)),
    (select max(r.date) from substitution_requests r
     where r.schedule_id = s.id and r.status in ('pending', 'accepted')),
    (select max(v.lesson_date) from supervision_scheduled_observations v
     where v.schedule_id = s.id)
  )::date as history_until
from schedules s
where s.tenant_id = $1 and s.id = any(sqlc.arg(ids)::uuid[])
  and (exists (select 1 from attendance_sessions a
               where a.schedule_id = s.id and attendance_session_recorded(a.id))
       or exists (select 1 from substitution_requests r where r.schedule_id = s.id)
       or exists (select 1 from supervision_scheduled_observations v where v.schedule_id = s.id));

-- name: CountSchedulesForClassOn :one
-- Read by the attendance module to compute a day's expected session count
-- for a class (attendance/domain.ComputeDailyStatus's Expected input): the
-- versions in effect on that date.
select count(*)::bigint from schedules
where tenant_id = $1 and academic_year_id = $2 and class_id = $3
  and day_of_week = extract(isodow from sqlc.arg(on_date)::date)::smallint
  and effective_range @> sqlc.arg(on_date)::date;

-- name: CountSchedulesByClassDates :many
-- Batch form of CountSchedulesForClassOn for the analytics recompute: the
-- expected-session count of every (class, date) pair among the given
-- classes and dates in one query. A pair with no lesson is absent (count 0).
select s.class_id, d.on_date::date as on_date, count(*)::bigint as total
from schedules s
join unnest(sqlc.arg(dates)::date[]) as d(on_date)
  on s.day_of_week = extract(isodow from d.on_date)::smallint
 and s.effective_range @> d.on_date::date
where s.tenant_id = $1 and s.academic_year_id = $2 and s.class_id = any(sqlc.arg(class_ids)::uuid[])
group by s.class_id, d.on_date;
