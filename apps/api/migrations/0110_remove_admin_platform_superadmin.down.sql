-- Reinstates the platform_superadmin grant on every tenant's system admin
-- role, undoing the up migration's cleanup.
insert into role_permissions (role_id, permission_code, tenant_id)
select roles.id, 'platform_superadmin', roles.tenant_id
from roles
where roles.is_system = true
  and roles.slug = 'admin'
on conflict (role_id, permission_code) do nothing;
