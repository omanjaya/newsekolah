-- name: GradingActiveTerm :one
-- cross-module read: terms is owned by the academic module.
select id, name from terms where tenant_id = $1 and academic_year_id = $2 and is_active limit 1;

-- name: GradingGetTerm :one
select id, academic_year_id, name, sequence from terms where tenant_id = $1 and id = $2;

-- name: GradingPreviousTerm :one
select id from terms where tenant_id = $1 and academic_year_id = $2 and sequence < $3 order by sequence desc limit 1;

-- name: GradingClassStudentIDs :many
-- cross-module read: enrollments is owned by the academic module.
select student_user_id from enrollments
where tenant_id = $1 and academic_year_id = $2 and class_id = $3 and status = 'active'
order by student_user_id;

-- name: GradingTeacherTeaches :one
-- cross-module read: teaching_assignments is owned by the academic module.
select exists (
  select 1 from teaching_assignments
  where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3 and class_id = $4 and subject_id = $5 and is_active
)::bool as teaches;

-- name: GradingStudentClassID :one
select class_id from enrollments
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3 and status = 'active'
limit 1;

-- name: GradingGetLatestPolicy :one
select config, version from tenant_policies where tenant_id = $1 and kind = $2 order by version desc limit 1;

-- name: GradingCreatePolicy :exec
insert into tenant_policies (tenant_id, kind, version, config, effective_from, created_by)
values ($1, $2, $3, $4, $5, $6)
on conflict (tenant_id, kind, version) do nothing;

-- name: GradingStudentNames :many
select id, name from users where tenant_id = $1 and id = any(sqlc.arg(user_ids)::uuid[]);
