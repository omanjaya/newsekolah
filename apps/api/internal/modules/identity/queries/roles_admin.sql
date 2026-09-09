-- name: ListRolesByTenant :many
select * from roles where tenant_id = $1 order by is_system desc, name;

-- name: GetRoleByID :one
select * from roles where tenant_id = $1 and id = $2;

-- name: UpdateRole :exec
update roles set slug = $3, name = $4, description = $5 where tenant_id = $1 and id = $2;

-- name: DeleteRole :exec
delete from roles where tenant_id = $1 and id = $2;

-- name: CountUsersForRole :one
select count(*) from user_roles where tenant_id = $1 and role_id = $2;

-- name: DeleteRolePermissions :exec
delete from role_permissions where tenant_id = $1 and role_id = $2;

-- name: ListPermissionsCatalog :many
select * from permissions order by group_name, code;

-- name: PermissionExists :one
select exists(select 1 from permissions where code = $1);

-- name: ListRolePermissionCodes :many
select permission_code from role_permissions where tenant_id = $1 and role_id = $2 order by permission_code;
