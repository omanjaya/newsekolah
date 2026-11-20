-- New permission `manage_calendar` (internal/platform/authz/
-- permissions_academic.go): adding, editing and deleting school calendar
-- events, split out of manage_academic_years so a school can let someone
-- set holiday and exam dates without also letting them create, activate
-- or archive academic years and terms. The principal role gets it by
-- default (role_defaults.go). cmd/migrate's PostUp upserts the catalog and
-- additively syncs RoleDefaults() onto existing system roles after this
-- SQL runs, but the row is inserted here first because role_permissions
-- below references it by foreign key (same pattern as
-- 0118_grading_view_grades_permission.up.sql).
insert into permissions (code, group_name, description)
values ('manage_calendar', 'academic', 'Create, update, and delete school calendar events')
on conflict (code) do nothing;

-- Every role (system or tenant-customised) that could edit the calendar
-- through manage_academic_years keeps that ability now that the calendar
-- routes require manage_calendar.
insert into role_permissions (role_id, permission_code, tenant_id)
select role_permissions.role_id, 'manage_calendar', role_permissions.tenant_id
from role_permissions
where role_permissions.permission_code = 'manage_academic_years'
on conflict (role_id, permission_code) do nothing;

-- The principal (Kepala Sekolah) sets the school's holiday and exam
-- dates, mirroring RoleDefaults()'s principal entry for every tenant that
-- already has the role.
insert into role_permissions (role_id, permission_code, tenant_id)
select roles.id, 'manage_calendar', roles.tenant_id
from roles
where roles.slug = 'principal' and roles.is_system = true
on conflict (role_id, permission_code) do nothing;
