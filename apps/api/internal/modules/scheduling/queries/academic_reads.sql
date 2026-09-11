-- cross-module read; replace with academic reader interface after merge
-- Every query in this file reads a table owned by the academic module
-- (migration 0003), which is being built in parallel in its own worktree.
-- Names are suffixed "Ref" to avoid colliding with the academic module's
-- own sqlc queries over the same tables once both are merged into one
-- generated db package.

-- name: GetClassRefForSchedule :one
select id, tenant_id, academic_year_id, name, homeroom_teacher_id
from classes
where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: GetSubjectRefForSchedule :one
select id, tenant_id, code, name
from subjects
where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: GetPeriodRefForSchedule :one
select id, tenant_id, template_id, name, sequence, starts_at, ends_at, is_break
from periods
where tenant_id = $1 and id = $2;

-- name: ListPeriodsRefByTemplate :many
select id, tenant_id, template_id, name, sequence, starts_at, ends_at, is_break
from periods
where tenant_id = $1 and template_id = $2
order by sequence;

-- name: GetPeriodTemplateRefForDay :one
select template_id
from period_day_assignments
where tenant_id = $1 and academic_year_id = $2 and day_of_week = $3;

-- name: IsSchoolDayRef :one
select coalesce(
  (select is_active from school_days where tenant_id = $1 and academic_year_id = $2 and day_of_week = $3),
  false
)::bool;

-- name: GetTeachingAssignmentRef :one
select id, is_active
from teaching_assignments
where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3 and subject_id = $4 and class_id = $5
  and is_active;

-- name: IsActiveTeacherRef :one
select exists(
  select 1 from teaching_assignments
  where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3 and is_active
);

-- name: ListActiveEnrollmentsRefByClass :many
select student_user_id, joined_on
from enrollments
where tenant_id = $1 and academic_year_id = $2 and class_id = $3 and status = 'active'
order by joined_on;

-- name: GetUserNameRefForSchedule :one
-- The display name backing a teacher/writer column in the journal XLSX
-- export -- users is owned by the identity module, not scheduling.
select name from users where tenant_id = $1 and id = $2;
