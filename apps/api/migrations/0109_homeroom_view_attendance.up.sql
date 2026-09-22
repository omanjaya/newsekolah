-- The homeroom duty's default permission set
-- (internal/platform/authz/duty_defaults.go) now includes view_attendance,
-- which GET /v1/attendance/homeroom requires. Duty defaults are applied only
-- when a tenant is provisioned, so tenants provisioned earlier need the
-- grant added here.
insert into duty_permissions (duty_type_id, permission_code, tenant_id)
select duty_types.id, 'view_attendance', duty_types.tenant_id
from duty_types
where duty_types.slug = 'homeroom'
on conflict (duty_type_id, permission_code) do nothing;
