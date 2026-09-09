-- name: AcademicCreateClass :one
insert into classes (tenant_id, academic_year_id, grade_level_id, track_id, name, room_id, capacity, homeroom_teacher_id)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: AcademicUpdateClass :one
update classes
set grade_level_id = $3, track_id = $4, name = $5, room_id = $6, capacity = $7, homeroom_teacher_id = $8, updated_at = now()
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;

-- name: AcademicGetClassByID :one
select * from classes where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: AcademicListClasses :many
select sqlc.embed(classes), count(*) over () as total_count
from classes
where tenant_id = $1
  and academic_year_id = $2
  and deleted_at is null
  and (sqlc.narg('search')::text is null or name ilike '%' || sqlc.narg('search') || '%')
  and (sqlc.narg('grade_level_id')::uuid is null or grade_level_id = sqlc.narg('grade_level_id'))
order by name
limit $3 offset $4;

-- name: AcademicListClassesByYearAndGradeLevel :many
select * from classes
where tenant_id = $1 and academic_year_id = $2 and grade_level_id = $3 and deleted_at is null
order by name;

-- name: AcademicSoftDeleteClass :exec
update classes set deleted_at = now(), updated_at = now() where tenant_id = $1 and id = $2;

-- name: AcademicCountEnrollmentsForClass :one
select count(*) from enrollments where tenant_id = $1 and class_id = $2 and status = 'active';

-- name: AcademicCountTeachingAssignmentsForClass :one
select count(*) from teaching_assignments where tenant_id = $1 and class_id = $2;
