-- Removes the principal system role from every tenant. role_permissions
-- (and user_roles, for any user already assigned the role) cascade on
-- roles.id delete (migration 0002), so deleting the role rows is enough.
delete from roles
where slug = 'principal' and is_system = true;
