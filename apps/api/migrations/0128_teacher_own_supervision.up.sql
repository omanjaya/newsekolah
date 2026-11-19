-- New permission `view_own_supervision` (internal/platform/authz/
-- permissions_supervision.go): the observed teacher's own read of
-- supervision -- the cycles, and their own report, planned visits and
-- observations only (the supervision service scopes it to the caller; see
-- domain.Reader). The teacher (Guru) system role now holds it together with
-- respond_to_supervision, which no default role carried before, so the
-- teacher's half of the workflow ("Supervisi saya": reading the observation
-- and responding to it) is reachable. view_supervision is deliberately NOT
-- granted: it reads every teacher's results.
--
-- cmd/migrate's PostUp (upserts the whole authz.Catalog into `permissions`,
-- then additively syncs RoleDefaults() onto existing system roles) runs
-- after this SQL migration, so both permission rows are inserted here first
-- -- role_permissions below references them by foreign key. PostUp's own
-- upsert later keeps group_name/description in sync with the Go catalog.
insert into permissions (code, group_name, description)
values
  ('view_own_supervision', 'supervision', 'See the supervision cycles and your own report and observations as the observed teacher'),
  ('respond_to_supervision', 'supervision', 'Add a teacher''s response and agreed follow-up to an observation of their own lesson')
on conflict (code) do nothing;

-- Mirrors RoleDefaults()'s teacher entry for every tenant that already has
-- the system role. Idempotent, and a no-op on a brand-new database.
insert into role_permissions (role_id, permission_code, tenant_id)
select roles.id, codes.code, roles.tenant_id
from roles
cross join (values ('view_own_supervision'), ('respond_to_supervision')) as codes (code)
where roles.slug = 'teacher' and roles.is_system = true
on conflict (role_id, permission_code) do nothing;
