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

-- name: DeleteJournal :exec
delete from class_journals where tenant_id = $1 and id = $2;
