-- Reverses 0130_view_counseling_permission.up.sql: every grant of
-- view_counseling (roles and duty types), then its catalog row.
delete from role_permissions
where permission_code = 'view_counseling';

delete from duty_permissions
where permission_code = 'view_counseling';

delete from permissions
where code = 'view_counseling';
