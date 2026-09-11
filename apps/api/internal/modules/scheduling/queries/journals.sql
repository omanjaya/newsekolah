-- name: CreateJournal :one
insert into class_journals (
  tenant_id, academic_year_id, teacher_user_id, written_by_user_id, class_id, subject_id,
  lesson_date, topic, activities, reflection, attendance_session_id
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
)
returning *;

-- name: UpdateJournal :one
update class_journals
set topic = $3, activities = $4, reflection = $5, written_by_user_id = $6, attendance_session_id = $7
where tenant_id = $1 and id = $2
returning *;

-- name: GetJournalByID :one
select * from class_journals where tenant_id = $1 and id = $2;

-- name: GetJournalByUnique :one
select * from class_journals
where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3
  and class_id = $4 and subject_id = $5 and lesson_date = $6;

-- name: ListJournalsByTeacher :many
select * from class_journals
where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3
order by lesson_date desc;

-- name: ListJournalsByClass :many
select * from class_journals
where tenant_id = $1 and academic_year_id = $2 and class_id = $3
order by lesson_date desc;

-- name: ListJournalsFiltered :many
-- The filtered/paginated list behind GET /v1/journals: exactly one of
-- teacher_user_id or class_id is set by the caller (self-service vs.
-- view_journals_all), mirroring ListJournalsByTeacher/ListJournalsByClass's
-- scoping but adding the date range/text search/pagination the old system
-- had (class_journals.go L85-107) and this rebuild had dropped.
select *
from class_journals
where tenant_id = $1 and academic_year_id = $2
  and (sqlc.narg(teacher_user_id)::uuid is null or teacher_user_id = sqlc.narg(teacher_user_id)::uuid)
  and (sqlc.narg(class_id)::uuid is null or class_id = sqlc.narg(class_id)::uuid)
  and (sqlc.narg(date_from)::date is null or lesson_date >= sqlc.narg(date_from)::date)
  and (sqlc.narg(date_to)::date is null or lesson_date <= sqlc.narg(date_to)::date)
  and (
    sqlc.narg(search)::text is null
    or topic ilike '%' || sqlc.narg(search)::text || '%'
    or activities ilike '%' || sqlc.narg(search)::text || '%'
  )
order by lesson_date desc, created_at desc
limit $3 offset $4;

-- name: CountJournalsFiltered :one
select count(*) from class_journals
where tenant_id = $1 and academic_year_id = $2
  and (sqlc.narg(teacher_user_id)::uuid is null or teacher_user_id = sqlc.narg(teacher_user_id)::uuid)
  and (sqlc.narg(class_id)::uuid is null or class_id = sqlc.narg(class_id)::uuid)
  and (sqlc.narg(date_from)::date is null or lesson_date >= sqlc.narg(date_from)::date)
  and (sqlc.narg(date_to)::date is null or lesson_date <= sqlc.narg(date_to)::date)
  and (
    sqlc.narg(search)::text is null
    or topic ilike '%' || sqlc.narg(search)::text || '%'
    or activities ilike '%' || sqlc.narg(search)::text || '%'
  );

-- name: DeleteJournal :exec
delete from class_journals where tenant_id = $1 and id = $2;
