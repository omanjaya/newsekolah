-- name: AcademicCreateSubject :one
insert into subjects (tenant_id, code, name)
values ($1, $2, $3)
returning *;

-- name: AcademicUpdateSubject :one
update subjects set code = $3, name = $4, updated_at = now()
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;

-- name: AcademicGetSubjectByID :one
select * from subjects where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: AcademicListSubjects :many
select sqlc.embed(subjects), count(*) over () as total_count
from subjects
where tenant_id = $1
  and deleted_at is null
  and (sqlc.narg('search')::text is null or name ilike '%' || sqlc.narg('search') || '%' or code ilike '%' || sqlc.narg('search') || '%')
order by name
limit $2 offset $3;

-- name: AcademicSoftDeleteSubject :exec
update subjects set deleted_at = now(), updated_at = now() where tenant_id = $1 and id = $2;

-- name: AcademicCountOfferingsForSubject :one
select count(*) from subject_offerings where tenant_id = $1 and subject_id = $2;

-- name: AcademicCountTeachingAssignmentsForSubject :one
select count(*) from teaching_assignments where tenant_id = $1 and subject_id = $2;

-- name: AcademicCreateSubjectOffering :one
insert into subject_offerings (tenant_id, academic_year_id, subject_id, grade_level_id, hours_per_week)
values ($1, $2, $3, $4, $5)
returning *;

-- name: AcademicUpdateSubjectOffering :one
update subject_offerings set grade_level_id = $3, hours_per_week = $4
where tenant_id = $1 and id = $2
returning *;

-- name: AcademicGetSubjectOfferingByID :one
select * from subject_offerings where tenant_id = $1 and id = $2;

-- name: AcademicListSubjectOfferings :many
-- In reading order: the offerings for every grade first, then grade by
-- grade in the school's own sequence, each grade's subjects by name.
select so.* from subject_offerings so
join subjects s on s.tenant_id = so.tenant_id and s.id = so.subject_id
left join grade_levels gl on gl.tenant_id = so.tenant_id and gl.id = so.grade_level_id
where so.tenant_id = $1 and so.academic_year_id = $2
order by gl.sequence nulls first, s.name, so.id;

-- name: AcademicDeleteSubjectOffering :exec
delete from subject_offerings where tenant_id = $1 and id = $2;

-- name: AcademicSubjectOfferedInYear :one
select exists (
  select 1 from subject_offerings
  where tenant_id = $1 and academic_year_id = $2 and subject_id = $3
);
