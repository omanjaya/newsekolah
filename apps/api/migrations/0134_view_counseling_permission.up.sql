-- New permission `view_counseling` (internal/platform/authz/
-- permissions_discipline.go): the read-only half of manage_counseling. A
-- counseling note with visibility "leadership" promised in its form that
-- school leadership could read it, but every counseling route needed
-- manage_counseling, which neither the principal role nor the leadership
-- duty holds (it would also let them author notes). The read routes now
-- accept view_counseling too, and the service's VisibleTo still keeps
-- "only me" and "BK team" notes from leadership.
--
-- cmd/migrate's PostUp upserts the catalog and additively syncs
-- RoleDefaults() onto existing system roles after this runs; duty types are
-- not synced for existing tenants, so the leadership duty is granted here.
insert into permissions (code, group_name, description)
values ('view_counseling', 'discipline', 'Read counseling notes shared with school leadership')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_code, tenant_id)
select roles.id, 'view_counseling', roles.tenant_id
from roles
where roles.slug = 'principal' and roles.is_system = true
on conflict (role_id, permission_code) do nothing;

insert into duty_permissions (duty_type_id, permission_code, tenant_id)
select duty_types.id, 'view_counseling', duty_types.tenant_id
from duty_types
where duty_types.slug = 'leadership' and duty_types.deleted_at is null
on conflict do nothing;
