-- The system "admin" role's default permission set
-- (internal/platform/authz/role_defaults.go, permissions_platform.go) has
-- never intended to include platform_superadmin: it gates the cross-tenant
-- platform console and a tenant's own administrator must never reach it.
-- syncSystemRoleDefaults (internal/platform/migrator/migrator.go) only
-- ever adds permissions to keep an admin's customisations intact, so a
-- tenant seeded before role_defaults.go excluded platform_superadmin still
-- carries the grant. Remove it explicitly here; super_admin (the platform
-- operator role) is untouched.
delete from role_permissions
using roles
where role_permissions.role_id = roles.id
  and roles.is_system = true
  and roles.slug = 'admin'
  and role_permissions.permission_code = 'platform_superadmin';
