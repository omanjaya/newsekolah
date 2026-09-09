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

-- name: UpdateDutyAssignment :exec
update duty_assignments set is_active = $3, ends_on = $4 where tenant_id = $1 and id = $2;

-- name: DeleteDutyAssignment :exec
delete from duty_assignments where tenant_id = $1 and id = $2;

-- name: ClassExistsInTenant :one
select exists(select 1 from classes where tenant_id = $1 and id = $2 and deleted_at is null);

-- name: UserExistsInTenant :one
select exists(select 1 from users where tenant_id = $1 and id = $2 and deleted_at is null);
