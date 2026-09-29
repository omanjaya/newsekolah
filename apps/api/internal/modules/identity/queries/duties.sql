-- name: ListActiveDutyAssignmentsForUser :many
-- as_of is the effective-permissions caller's business date: the
-- simulated date when a superadmin is running a time simulation for this
-- request (including while impersonating another user), the real date
-- otherwise -- see internal/platform/clock and
-- identity/service.loadPrincipal, which feeds this into authz.Principal.
-- This decides which duties are active; it never decides whether the
-- session itself is valid (see session_active.sql's IsSessionActive,
-- which stays on the real clock).
select
  dt.slug,
  dt.name,
  dt.scope_kind,
  da.scope_class_id,
  da.scope_student_id
from duty_assignments da
join duty_types dt on dt.id = da.duty_type_id
where da.tenant_id = $1
  and da.user_id = $2
  and da.academic_year_id = $3
  and da.is_active
  and dt.is_active
  and dt.deleted_at is null
  and da.starts_on <= sqlc.arg(as_of)::date
  and (da.ends_on is null or da.ends_on >= sqlc.arg(as_of)::date);

-- name: ListPermissionCodesForDutyTypes :many
select distinct duty_type_id, permission_code from duty_permissions where duty_type_id = any(sqlc.arg(duty_type_ids)::uuid[]);

-- name: CreateDutyType :one
insert into duty_types (tenant_id, slug, name, scope_kind)
values ($1, $2, $3, $4)
returning *;

-- name: AddDutyPermission :exec
insert into duty_permissions (duty_type_id, permission_code, tenant_id)
values ($1, $2, $3)
on conflict do nothing;

-- name: GetDutyTypeBySlug :one
select * from duty_types where tenant_id = $1 and slug = $2;

-- name: CreateDutyAssignment :one
insert into duty_assignments (tenant_id, academic_year_id, duty_type_id, user_id, scope_class_id, scope_student_id, starts_on)
values ($1, $2, $3, $4, $5, $6, $7)
returning *;

-- name: ListUserIDsWithActiveDuty :many
-- Who currently holds a duty in the active academic year: every holder of
-- a school-scoped duty, or the holders scoped to class_id when it is given.
-- Used by the wiring layer/event bus to address notifications (homeroom of
-- a class, security staff at the gate) when an unrelated event fires; that
-- always runs on the real clock like the rest of business-time simulation's
-- background/event-delivery paths (docs/testing-time-simulation.md), so
-- current_date here is intentionally left as the database's own real date,
-- not the simulated clock ListActiveDutyAssignmentsForUser above follows.
select distinct da.user_id
from duty_assignments da
join duty_types dt on dt.id = da.duty_type_id
join academic_years ay on ay.id = da.academic_year_id and ay.is_active
where da.tenant_id = $1
  and dt.slug = $2
  and da.is_active
  and dt.is_active
  and dt.deleted_at is null
  and da.starts_on <= current_date
  and (da.ends_on is null or da.ends_on >= current_date)
  and (
    dt.scope_kind = 'school'
    or (sqlc.narg('class_id')::uuid is not null and da.scope_class_id = sqlc.narg('class_id')::uuid)
  );
