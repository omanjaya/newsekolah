-- name: ListComponents :many
select * from assessment_components
where tenant_id = $1 and term_id = $2 and class_id = $3 and subject_id = $4
order by sequence, created_at;

-- name: GetComponent :one
select * from assessment_components where tenant_id = $1 and id = $2;

-- name: CreateComponent :one
insert into assessment_components (tenant_id, academic_year_id, term_id, teacher_user_id, class_id, subject_id, code, kind, description, kktp, weight, sequence)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
returning *;

-- name: UpdateComponent :one
update assessment_components set code = $3, kind = $4, description = $5, kktp = $6, weight = $7, sequence = $8
where tenant_id = $1 and id = $2
returning *;

-- name: DeleteComponent :exec
delete from assessment_components where tenant_id = $1 and id = $2;

-- name: UpsertGrade :one
insert into grades (tenant_id, component_id, student_user_id, score, recorded_by)
values ($1, $2, $3, $4, $5)
on conflict (component_id, student_user_id) do update set score = excluded.score, recorded_by = excluded.recorded_by
returning *;

-- name: ListGradesForComponents :many
select g.* from grades g
where g.tenant_id = $1 and g.component_id = any(sqlc.arg(component_ids)::uuid[]);

-- name: ListGradesForStudent :many
-- Every grade of one student in a term, joined to its component; the
-- service hides subjects whose publication is still off.
select g.score, g.updated_at, c.id as component_id, c.code, c.kind, c.weight, c.kktp, c.subject_id, c.class_id, c.term_id
from grades g
join assessment_components c on c.id = g.component_id
where g.tenant_id = $1 and g.student_user_id = $2 and c.term_id = $3
order by c.subject_id, c.sequence;

-- name: UpsertPublication :one
insert into grade_publications (tenant_id, academic_year_id, term_id, class_id, subject_id, is_published, published_at, published_by)
values ($1, $2, $3, $4, $5, $6, case when $6 then now() else null end, $7)
on conflict (academic_year_id, term_id, class_id, subject_id) do update
  set is_published = excluded.is_published, published_at = excluded.published_at, published_by = excluded.published_by
returning *;

-- name: GetPublication :one
select * from grade_publications
where tenant_id = $1 and term_id = $2 and class_id = $3 and subject_id = $4;

-- name: ListPublishedSubjectsForClass :many
select subject_id from grade_publications
where tenant_id = $1 and term_id = $2 and class_id = $3 and is_published;
