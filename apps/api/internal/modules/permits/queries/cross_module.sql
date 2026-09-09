-- cross-module read; replace with reader interface after merge.
--
-- academic (classes, enrollments, periods) and identity (users,
-- teacher_profiles, student_profiles, duty_types, duty_assignments) own
-- these tables; permits only reads them, read-only, to evaluate approver
-- rules and snapshot names. Once every module has merged, each query here
-- should become a call through a narrow exported interface (the same
-- pattern identity/service.AcademicYearReader already uses for the school
-- module) instead of permits querying another module's tables directly.

-- name: GetActiveEnrollment :one
select e.student_user_id, e.class_id, c.name as class_name, c.homeroom_teacher_id
from enrollments e
join classes c on c.id = e.class_id
where e.tenant_id = $1 and e.academic_year_id = $2 and e.student_user_id = $3 and e.status = 'active'
limit 1;

-- name: GetClassName :one
select name from classes where tenant_id = $1 and id = $2;

-- name: GetUserName :one
select name from users where tenant_id = $1 and id = $2;

-- name: GetStudentGuardianName :one
select coalesce(guardian_name, '')::text as guardian_name
from student_profiles
where tenant_id = $1 and user_id = $2;

-- name: IsActiveTeacher :one
select exists (
  select 1 from teacher_profiles tp
  join users u on u.id = tp.user_id
  where tp.tenant_id = $1 and tp.user_id = $2 and u.status = 'active'
)::bool as is_teacher;

-- name: HasActiveDuty :one
-- Evaluates the "duty:<slug>" approver rule: does user_id currently hold
-- an active duty of this slug, and (for a class-scoped duty) does it cover
-- class_id (NULL class_id matches only a school-scoped duty).
select exists (
  select 1
  from duty_assignments da
  join duty_types dt on dt.id = da.duty_type_id
  where da.tenant_id = $1
    and da.academic_year_id = $2
    and da.user_id = $3
    and dt.slug = $4
    and da.is_active
    and dt.is_active
    and dt.deleted_at is null
    and da.starts_on <= current_date
    and (da.ends_on is null or da.ends_on >= current_date)
    and (
      dt.scope_kind = 'school'
      or (dt.scope_kind = 'class' and sqlc.narg('class_id')::uuid is not null and da.scope_class_id = sqlc.narg('class_id')::uuid)
    )
)::bool as has_duty;

-- name: GetPeriod :one
select id, template_id, name, sequence, starts_at, ends_at, is_break from periods where tenant_id = $1 and id = $2;

-- name: ListActiveTenants :many
-- tenants carries no RLS policy (see modules/school/repository.go), so
-- this is safe to run off the pool directly for the platform-wide expiry
-- and token-cleanup jobs, which must iterate every tenant.
select id, timezone from tenants where status in ('trial', 'active');
