-- name: CreateJournal :one
insert into class_journals (
  tenant_id, academic_year_id, teacher_user_id, written_by_user_id, class_id, subject_id,
  lesson_date, topic, activities, reflection, attendance_session_id
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
)
returning *;

-- name: UpsertJournal :one
-- The attendance editor's write: one atomic statement, so two saves of the
-- same lesson racing each other update one row instead of the second
-- insert failing on the unique key.
insert into class_journals (
  tenant_id, academic_year_id, teacher_user_id, written_by_user_id, class_id, subject_id,
  lesson_date, topic, activities, reflection, attendance_session_id
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
)
on conflict (academic_year_id, teacher_user_id, class_id, subject_id, lesson_date) do update set
  topic = excluded.topic,
  activities = excluded.activities,
  reflection = excluded.reflection,
  written_by_user_id = excluded.written_by_user_id,
  attendance_session_id = coalesce(excluded.attendance_session_id, class_journals.attendance_session_id)
returning *;

-- name: UpdateJournal :one
-- Edits one journal by id, its lesson (class, subject, date) included; a
-- lesson that already has another journal fails on the unique key.
update class_journals
set topic = $3, activities = $4, reflection = $5, written_by_user_id = $6, attendance_session_id = $7,
  class_id = $8, subject_id = $9, lesson_date = $10
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

-- name: GetLatestJournalForClassSubjectBeforeDate :one
-- The last journal written for a class and subject before date, whoever
-- wrote it and on whichever weekday: the attendance editor's "previous
-- meeting's topic".
select * from class_journals
where tenant_id = $1 and academic_year_id = $2 and class_id = $3 and subject_id = $4
  and lesson_date < $5
order by lesson_date desc, created_at desc
limit 1;
