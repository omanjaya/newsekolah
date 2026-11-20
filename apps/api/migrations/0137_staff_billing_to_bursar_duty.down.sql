-- Restores view_billing and record_payments on every tenant's staff system
-- role. The bursar duty type is left in place: it may already be assigned.
insert into role_permissions (role_id, permission_code, tenant_id)
select roles.id, codes.code, roles.tenant_id
from roles
cross join (values ('view_billing'), ('record_payments')) as codes (code)
where roles.slug = 'staff' and roles.is_system = true
on conflict (role_id, permission_code) do nothing;
