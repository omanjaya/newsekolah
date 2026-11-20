-- name: CreateSchedule :one
insert into schedules (
  tenant_id, academic_year_id, term_id, class_id, subject_id, teacher_user_id, room_id,
  day_of_week, start_period_id, end_period_id, start_seq, end_seq, source, notes, created_by, updated_by
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15
)
returning *;

-- name: GetScheduleByID :one
select * from schedules where tenant_id = $1 and id = $2 for update;

-- name: UpdateSchedule :one
update schedules set
  term_id = $3, class_id = $4, subject_id = $5, teacher_user_id = $6, room_id = $7,
  day_of_week = $8, start_period_id = $9, end_period_id = $10, start_seq = $11, end_seq = $12,
  source = $13, notes = $14, updated_by = $15
where tenant_id = $1 and id = $2
returning *;

-- name: DeleteSchedule :exec
delete from schedules where tenant_id = $1 and id = $2;

-- name: DeleteSchedulesByAcademicYear :exec
delete from schedules where tenant_id = $1 and academic_year_id = $2;

-- name: ListSchedulesByAcademicYear :many
select * from schedules where tenant_id = $1 and academic_year_id = $2 order by day_of_week, start_seq;

-- name: ListSchedulesByClass :many
select * from schedules
where tenant_id = $1 and academic_year_id = $2 and class_id = $3
order by day_of_week, start_seq;

-- name: ListSchedulesByTeacher :many
select * from schedules
where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3
order by day_of_week, start_seq;

-- name: ListSchedulesByDay :many
select * from schedules
where tenant_id = $1 and academic_year_id = $2 and day_of_week = $3
order by start_seq;

-- name: ListScheduleIDsWithHistory :many
-- Which of the given schedules already have a recorded attendance session
-- (submitted, or holding an entry or a journal) or a substitution request:
-- the history guard (migrations 0107 and 0143) refuses to change or delete
-- those, so the grid and the single-schedule policy say so before the
-- admin fills a form. A session only opened, with nothing recorded, is a
-- placeholder the guard clears instead.
select s.id from schedules s
where s.tenant_id = $1 and s.id = any(sqlc.arg(ids)::uuid[])
  and (exists (select 1 from attendance_sessions a
               where a.schedule_id = s.id and attendance_session_recorded(a.id))
       or exists (select 1 from substitution_requests r where r.schedule_id = s.id));

-- name: CountSchedulesForClassDay :one
-- Read by the attendance module to compute a day's expected session count
-- for a class (attendance/domain.ComputeDailyStatus's Expected input).
select count(*)::bigint from schedules
where tenant_id = $1 and academic_year_id = $2 and class_id = $3 and day_of_week = $4;

-- name: CountSchedulesByClassDay :many
-- Batch form of CountSchedulesForClassDay for the analytics recompute: the
-- expected-session count of every (class, weekday) pair among the given
-- classes in one query. A pair with no schedule is absent (count 0).
select class_id, day_of_week, count(*)::bigint as total
from schedules
where tenant_id = $1 and academic_year_id = $2 and class_id = any(sqlc.arg(class_ids)::uuid[])
group by class_id, day_of_week;
