-- name: IsSessionActive :one
-- Authentication: whether the session itself is still valid. Always the
-- real clock -- never the simulated business time (see
-- docs/testing-time-simulation.md), so a simulated future date can never
-- extend a session's real-world lifetime.
select (revoked_at is null and expires_at > now()) as active
from sessions
where tenant_id = $1 and id = $2;

-- name: ListActiveDutyAssignmentsWithPermissions :many
-- Despite living alongside session queries, this is not a session/token
-- query: it is the permission half of the same duty-validity computation
-- as duties.sql's ListActiveDutyAssignmentsForUser (identity/repository's
-- ListActiveDuties calls both for the same user/year to build one
-- authz.Principal). as_of must be the same business date passed there, or
-- a duty could show "active" with none of its permissions attached (or
-- vice versa). See ListActiveDutyAssignmentsForUser's comment for what
-- as_of is.
select dt.slug, dp.permission_code
from duty_assignments da
join duty_types dt on dt.id = da.duty_type_id
join duty_permissions dp on dp.duty_type_id = dt.id
where da.tenant_id = $1
  and da.user_id = $2
  and da.academic_year_id = $3
  and da.is_active
  and dt.is_active
  and dt.deleted_at is null
  and da.starts_on <= sqlc.arg(as_of)::date
  and (da.ends_on is null or da.ends_on >= sqlc.arg(as_of)::date);
