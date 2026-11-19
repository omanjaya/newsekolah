-- Reverses 0128_teacher_own_supervision.up.sql: the teacher system role's
-- respond_to_supervision grant, every grant of view_own_supervision, then
-- the view_own_supervision catalog row. respond_to_supervision itself stays
-- in the catalog: it predates this migration.
delete from role_permissions
using roles
where role_permissions.role_id = roles.id
  and roles.slug = 'teacher' and roles.is_system = true
  and role_permissions.permission_code = 'respond_to_supervision';

delete from role_permissions
where permission_code = 'view_own_supervision';

delete from permissions
where code = 'view_own_supervision';
