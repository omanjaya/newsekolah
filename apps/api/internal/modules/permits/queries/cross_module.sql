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

-- name: GetTenantTimezoneForPermits :one
-- Mirrors attendance's GetTenantTimezoneForAttendance: permits must resolve
-- gate-token expiry, forced attendance windows and the
-- "teacher_of_class_now" approver rule's current time in the tenant's own
-- timezone, never the server's UTC clock.
select timezone from tenants where id = $1;

-- name: HasPermission :one
-- Whether user_id holds permission_code in the tenant, from either a
-- directly assigned role (role_permissions) or an active duty
-- (duty_permissions) -- the union authz.EffectivePermissions computes for
-- the HTTP layer, reimplemented here for the service-level ownership
-- checks permits itself must make on detail endpoints that carry no
-- per-instance duty scope to check against (see RequireCanViewLeaveRequest
-- and its exit-permit/late-arrival counterparts).
select exists (
  select 1
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  where ur.tenant_id = $1 and ur.user_id = $2 and rp.permission_code = $3
  union all
  select 1
  from duty_assignments da
  join duty_types dt on dt.id = da.duty_type_id
  join duty_permissions dp on dp.duty_type_id = dt.id
  where da.tenant_id = $1
    and da.academic_year_id = $4
    and da.user_id = $2
    and dp.permission_code = $3
    and da.is_active
    and dt.is_active
    and dt.deleted_at is null
    and da.starts_on <= current_date
    and (da.ends_on is null or da.ends_on >= current_date)
)::bool as has_permission;

-- name: HasRolePermission :one
-- Whether user_id holds permission_code through a directly assigned role,
-- specifically excluding duty-granted permissions -- the distinction the
-- late-arrival review "admins as fallback" rule needs: a picket-duty
-- teacher's manage_attendance (duty-granted) only lets them review the
-- flows their own token opened, while a role-granted manage_attendance
-- (e.g. an attendance administrator, or super_admin) may review any.
select exists (
  select 1
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  where ur.tenant_id = $1 and ur.user_id = $2 and rp.permission_code = $3
)::bool as has_role_permission;

-- name: IsStudentProfile :one
-- Missing rule: classroom-entry tokens may only be consumed by a student
-- profile (a teacher or any other staff scanning it is not "entering
-- class late"), matching the old app's QR consumer check.
select exists (
  select 1 from student_profiles where tenant_id = $1 and user_id = $2
)::bool as is_student;

-- name: GetAcademicYearRange :one
-- Backs the exit-permit yearly report: ListExitPermitsForReport takes an
-- opened_at range, so the caller needs the active academic year's own
-- calendar bounds to build one.
select starts_on, ends_on from academic_years where tenant_id = $1 and id = $2;

-- name: GetStudentNISAndAddress :one
-- The leave-letter template's {{nis}} and {{address}} placeholders.
select
  coalesce(sp.nis, '')::text as nis,
  coalesce(u.address, '')::text as address
from users u
left join student_profiles sp on sp.user_id = u.id and sp.tenant_id = u.tenant_id
where u.tenant_id = $1 and u.id = $2;
