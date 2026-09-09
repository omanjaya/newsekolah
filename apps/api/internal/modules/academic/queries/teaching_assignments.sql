-- name: AcademicCreateTeachingAssignment :one
insert into teaching_assignments (tenant_id, academic_year_id, teacher_user_id, subject_id, class_id, is_active)
values ($1, $2, $3, $4, $5, true)
returning *;

-- name: AcademicGetTeachingAssignmentByID :one
select * from teaching_assignments where tenant_id = $1 and id = $2;

-- name: AcademicUpdateTeachingAssignment :one
update teaching_assignments set is_active = $3, updated_at = now()
where tenant_id = $1 and id = $2
returning *;

-- name: AcademicDeleteTeachingAssignment :exec
delete from teaching_assignments where tenant_id = $1 and id = $2;

-- name: AcademicDeleteTeachingAssignmentsForTeacherInYear :exec
delete from teaching_assignments where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3;

-- name: AcademicListTeachingAssignments :many
select sqlc.embed(teaching_assignments), count(*) over () as total_count
from teaching_assignments
where tenant_id = $1
  and academic_year_id = $2
  and (sqlc.narg('teacher_user_id')::uuid is null or teacher_user_id = sqlc.narg('teacher_user_id'))
  and (sqlc.narg('class_id')::uuid is null or class_id = sqlc.narg('class_id'))
order by id
limit $3 offset $4;

-- name: AcademicListTeachingAssignmentsByTeacher :many
select * from teaching_assignments
where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3 and is_active;

-- name: AcademicTeacherHasAssignment :one
select exists (
  select 1 from teaching_assignments
  where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3 and subject_id = $4 and class_id = $5 and is_active
);
