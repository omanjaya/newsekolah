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

-- name: CountSchedulesForClassDay :one
-- Read by the attendance module to compute a day's expected session count
-- for a class (attendance/domain.ComputeDailyStatus's Expected input).
select count(*)::bigint from schedules
where tenant_id = $1 and academic_year_id = $2 and class_id = $3 and day_of_week = $4;
