-- Reverses 0118_grading_view_grades_permission.up.sql: every grant of
-- view_grades (whether backfilled here or made through the ordinary role
-- admin API since), then the permission catalog row itself. Deleting the
-- permissions row alone would already cascade role_permissions away
-- (migration 0002), but both deletes are explicit for clarity.
delete from role_permissions
where permission_code = 'view_grades';

delete from permissions
where code = 'view_grades';
