-- The "principal" (Kepala Sekolah) system role
-- (internal/platform/authz/role_defaults.go) is new: it did not exist
-- before this migration. syncSystemRoleDefaults
-- (internal/platform/migrator/migrator.go) only ever grants a tenant's
-- EXISTING system roles the permissions their default set gained -- it
-- never creates a system role that is entirely missing -- so every tenant
-- provisioned before this migration needs the role, and its default
-- permission grants, inserted here explicitly. A tenant provisioned after
-- this migration gets it straight from RoleDefaults() (cmd/seed,
-- cmd/etl/migrate_identity.go). Idempotent: safe to re-run, and a no-op on
-- a brand-new database that has no tenants yet.
insert into roles (tenant_id, slug, name, is_system)
select tenants.id, 'principal', 'Kepala Sekolah', true
from tenants
on conflict (tenant_id, slug) do nothing;

-- Default permission set mirrors RoleDefaults()'s principal entry exactly
-- (see that file's comment for why each permission is, or is not, here).
insert into role_permissions (role_id, permission_code, tenant_id)
select roles.id, perm.code, roles.tenant_id
from roles
cross join (
  values
    ('view_dashboard'),
    ('view_announcements'),
    ('publish_announcements'),
    ('view_audit_logs'),
    ('view_schedules'),
    ('view_journals_all'),
    ('view_attendance'),
    ('view_staff_attendance'),
    ('view_notifications'),
    ('view_reports'),
    ('manage_report_schedules'),
    ('view_library'),
    ('view_library_reports'),
    ('view_own_library_loans'),
    ('view_academic_data'),
    ('view_activities'),
    ('view_early_warning'),
    ('view_billing'),
    ('view_discipline'),
    ('view_mentoring'),
    ('view_supervision'),
    ('manage_supervision'),
    ('view_visitors'),
    ('view_visitor_incidents'),
    ('view_visitor_reports')
) as perm(code)
where roles.slug = 'principal' and roles.is_system = true
on conflict (role_id, permission_code) do nothing;
