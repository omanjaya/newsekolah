-- name: ListRolesForUser :many
select r.id, r.slug, r.name, ur.is_primary
from user_roles ur
join roles r on r.id = ur.role_id
where ur.user_id = $1
order by ur.is_primary desc, r.name;

-- name: ListPermissionCodesForRoles :many
select distinct permission_code from role_permissions where role_id = any(sqlc.arg(role_ids)::uuid[]);

-- name: CreateRole :one
insert into roles (tenant_id, slug, name, description, is_system)
values ($1, $2, $3, $4, $5)
returning *;

-- name: GetRoleBySlug :one
select * from roles where tenant_id = $1 and slug = $2;

-- name: AddRolePermission :exec
insert into role_permissions (role_id, permission_code, tenant_id)
values ($1, $2, $3)
on conflict do nothing;

-- name: AssignUserRole :exec
insert into user_roles (user_id, role_id, tenant_id, is_primary, academic_year_id)
values ($1, $2, $3, $4, $5)
on conflict do nothing;

-- name: UpsertPermission :exec
insert into permissions (code, group_name, description)
values ($1, $2, $3)
on conflict (code) do update set group_name = excluded.group_name, description = excluded.description;

-- name: ListSystemRoles :many
select id, tenant_id, slug from roles where tenant_id = $1 and is_system = true;
