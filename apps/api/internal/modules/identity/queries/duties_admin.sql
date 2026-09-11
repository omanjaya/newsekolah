-- name: ListDutyTypes :many
select * from duty_types
where tenant_id = $1 and (sqlc.arg(include_inactive)::bool or (is_active and deleted_at is null))
order by name;

-- name: GetDutyTypeByID :one
select * from duty_types where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: UpdateDutyType :exec
update duty_types set name = $3, scope_kind = $4, is_active = $5
where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: SoftDeleteDutyType :exec
update duty_types set deleted_at = now(), is_active = false where tenant_id = $1 and id = $2;

-- name: CountAssignmentsForDutyType :one
select count(*) from duty_assignments where tenant_id = $1 and duty_type_id = $2;

-- name: DeleteDutyPermissions :exec
delete from duty_permissions where tenant_id = $1 and duty_type_id = $2;

-- name: ListDutyPermissionCodes :many
select permission_code from duty_permissions where tenant_id = $1 and duty_type_id = $2 order by permission_code;

-- name: ListDutyAssignmentsAdmin :many
select da.*, dt.slug as duty_slug, dt.name as duty_name
from duty_assignments da
join duty_types dt on dt.id = da.duty_type_id
where da.tenant_id = sqlc.arg(tenant_id)
  and da.academic_year_id = sqlc.arg(academic_year_id)
  and (sqlc.narg(duty_type_id)::uuid is null or da.duty_type_id = sqlc.narg(duty_type_id))
  and (sqlc.narg(user_id)::uuid is null or da.user_id = sqlc.narg(user_id))
order by da.created_at desc;

-- name: GetDutyAssignmentByID :one
select * from duty_assignments where tenant_id = $1 and id = $2;

-- name: FindActiveHomeroomAssignmentForClass :one
-- The identity-side mirror of academic's AcademicFindActiveHomeroomAssignment:
-- lets CreateDutyAssignment end the class's previous active homeroom duty
-- before creating a new one, so at most one stays active at a time.
select id from duty_assignments
where tenant_id = $1 and academic_year_id = $2 and duty_type_id = $3 and scope_class_id = $4 and is_active
limit 1;

-- name: UpdateDutyAssignment :exec
update duty_assignments set is_active = $3, ends_on = $4 where tenant_id = $1 and id = $2;

-- name: DeleteDutyAssignment :exec
delete from duty_assignments where tenant_id = $1 and id = $2;

-- name: ClassExistsInTenant :one
select exists(select 1 from classes where tenant_id = $1 and id = $2 and deleted_at is null);

-- name: ClassExistsInYear :one
-- A duty assignment's scope class must belong to the same academic year as
-- the assignment itself, the same rule teaching assignments and schedules
-- enforce on their own class references.
select exists(select 1 from classes where tenant_id = $1 and id = $2 and academic_year_id = $3 and deleted_at is null);

-- name: IsActiveStudentInTenant :one
-- A duty assignment's student-scope target must be an active user with a
-- student profile -- the same strictness IsActiveTeacherOrStaff already
-- applies to the assignee; UserExistsInTenant alone only proves "some
-- user exists", not "an active student".
select exists(
  select 1 from users u
  join user_profiles up on up.user_id = u.id and up.kind = 'student'
  where u.tenant_id = $1 and u.id = $2 and u.deleted_at is null and u.status = 'active'
);

-- name: UpdateClassHomeroomTeacher :exec
-- Keeps classes.homeroom_teacher_id in sync with the "homeroom" duty
-- assignment for that class: attendance and permits both read this column
-- directly (a duty lookup on every attendance write would be wasteful), so
-- creating, ending, or deleting a homeroom duty assignment writes it here
-- too, in the same transaction as the duty_assignments row.
update classes set homeroom_teacher_id = $3 where tenant_id = $1 and id = $2;

-- name: ListStaffOptions :many
-- Active users with a teacher or staff profile, for a duty assignment
-- form's assignee dropdown -- the same eligibility IsActiveTeacherOrStaff
-- checks on create.
select u.id, u.name
from users u
join user_profiles up on up.user_id = u.id and up.kind in ('teacher', 'staff')
where u.tenant_id = $1
  and u.deleted_at is null
  and u.status = 'active'
  and (sqlc.narg('search')::text is null or u.name ilike '%' || sqlc.narg('search') || '%')
order by u.name
limit $2;

-- name: IsActiveTeacherOrStaff :one
-- A duty assignment's assignee must be an active user with a teacher or
-- staff profile -- the old app kept teacher and employee duties in
-- separate tables for exactly this reason (employee_duties.go,
-- academic_scope.go); this is the merged model's equivalent guard.
select exists(
  select 1 from users u
  join user_profiles up on up.user_id = u.id and up.kind in ('teacher', 'staff')
  where u.tenant_id = $1 and u.id = $2 and u.deleted_at is null and u.status = 'active'
);
