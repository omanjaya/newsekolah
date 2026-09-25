-- New permission `view_grades` (internal/platform/authz/permissions.go):
-- the grading module's read-only split of manage_grades, so a role can be
-- given the gradebook, report scores/report cards, grade ranges, TP
-- mappings and the e-Rapor exports without also being able to edit any
-- score, component, weight or publication (see
-- openapi/modules/grading.yaml and grading/transport/http/handler.go's
-- canViewAny). cmd/migrate's PostUp (upserts the whole authz.Catalog into
-- `permissions`, then additively syncs RoleDefaults() onto every tenant's
-- existing system roles) runs after this SQL migration, so the row is
-- inserted here first -- role_permissions below references it by foreign
-- key and would otherwise fail before PostUp ever runs. PostUp's own
-- upsert later keeps group_name/description in sync with permissions.go,
-- so an exact match here is not load-bearing.
insert into permissions (code, group_name, description)
values ('view_grades', 'grading', 'View grades, gradebooks, recap and export reports (read-only)')
on conflict (code) do nothing;

-- manage_grades implies view_grades: every role (system or
-- tenant-customised) that already holds manage_grades -- on any tenant --
-- gets view_grades too, so switching the grading module's read
-- operations from manage_grades to view_grades never removes read access
-- from anyone who already had it. Idempotent, and a no-op on a brand-new
-- database that has no role_permissions rows yet.
insert into role_permissions (role_id, permission_code, tenant_id)
select role_permissions.role_id, 'view_grades', role_permissions.tenant_id
from role_permissions
where role_permissions.permission_code = 'manage_grades'
on conflict (role_id, permission_code) do nothing;

-- The principal (Kepala Sekolah) system role (migration 0117) is a pure
-- oversight role and never held manage_grades, so it needs view_grades
-- granted explicitly here -- mirroring RoleDefaults()'s principal entry
-- (internal/platform/authz/role_defaults.go) for every tenant that
-- already has the role.
insert into role_permissions (role_id, permission_code, tenant_id)
select roles.id, 'view_grades', roles.tenant_id
from roles
where roles.slug = 'principal' and roles.is_system = true
on conflict (role_id, permission_code) do nothing;
