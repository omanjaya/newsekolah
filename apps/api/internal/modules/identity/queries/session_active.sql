-- name: IsSessionActive :one
select (revoked_at is null and expires_at > now()) as active
from sessions
where tenant_id = $1 and id = $2;

-- name: ListActiveDutyAssignmentsWithPermissions :many
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
  and da.starts_on <= current_date
  and (da.ends_on is null or da.ends_on >= current_date);
