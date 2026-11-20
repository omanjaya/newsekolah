-- The Pegawai (staff) system role is every non-teaching employee:
-- security, cleaners, administrative staff. It carried view_billing and
-- record_payments by default, so a security guard could read every
-- family's arrears and record cash payments that issue official receipts.
-- Billing now comes from the bursar ("Bendahara") duty
-- (internal/platform/authz/duty_defaults.go), which the admin assigns to
-- the treasurer.
--
-- cmd/migrate's PostUp only ever adds role defaults, so the grants must be
-- removed here. A custom role an admin built is never touched.
delete from role_permissions
using roles
where role_permissions.role_id = roles.id
  and roles.slug = 'staff'
  and roles.is_system = true
  and role_permissions.permission_code in ('view_billing', 'record_payments');

-- Every existing tenant gets the bursar duty type with its default
-- permissions now, so the admin can hand billing to the treasurer right
-- away. PostUp's EnsureTenantDefaults would create it too; doing it here
-- keeps the move in one step. A tenant that already has a 'bursar' duty
-- with permissions keeps it as it is.
insert into duty_types (tenant_id, slug, name, scope_kind)
select tenants.id, 'bursar', 'Bendahara', 'school'
from tenants
on conflict (tenant_id, slug) do nothing;

insert into duty_permissions (duty_type_id, permission_code, tenant_id)
select duty_types.id, codes.code, duty_types.tenant_id
from duty_types
cross join (values ('view_billing'), ('record_payments')) as codes (code)
where duty_types.slug = 'bursar'
  and not exists (
    select 1 from duty_permissions existing where existing.duty_type_id = duty_types.id
  )
on conflict (duty_type_id, permission_code) do nothing;
