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

-- name: IsAcademicYearArchivedRef :one
select (archived_at is not null)::bool from academic_years where tenant_id = $1 and id = $2;

-- name: IsSchoolDayRef :one
select coalesce(
  (select is_active from school_days where tenant_id = $1 and academic_year_id = $2 and day_of_week = $3),
  false
)::bool;

-- name: GetUserRefForSchedule :one
select id, name
from users
where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: GetStudentActiveClassRef :one
-- The class a student is actively enrolled in this academic year, for
-- scoping schedule reads: a student may only list their own class's
-- schedule, per teaching_schedules.go's studentClass lookup in the old app.
select class_id
from enrollments
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3 and status = 'active';

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

-- name: ListTeacherOptionsRef :many
-- Active teachers with a teaching assignment in academic_year_id, for a
-- schedule form's teacher dropdown. self_user_id narrows to one teacher
-- (a caller without manage_schedules/manage_master_data sees only
-- themselves); pass null to see everyone.
select distinct u.id, u.name
from users u
join user_profiles up on up.user_id = u.id and up.kind = 'teacher'
join teaching_assignments ta on ta.tenant_id = u.tenant_id and ta.teacher_user_id = u.id
  and ta.academic_year_id = $2 and ta.is_active
where u.tenant_id = $1
  and u.deleted_at is null
  and u.status = 'active'
  and (sqlc.narg('search')::text is null or u.name ilike '%' || sqlc.narg('search') || '%')
  and (sqlc.narg('self_user_id')::uuid is null or u.id = sqlc.narg('self_user_id'))
order by u.name
limit $3;
