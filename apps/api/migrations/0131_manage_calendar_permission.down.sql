-- Reverses 0131_manage_calendar_permission.up.sql: every grant of
-- manage_calendar, then the permission catalog row itself. The calendar
-- routes fall back to manage_academic_years with the code that requires
-- it.
delete from role_permissions
where permission_code = 'manage_calendar';

delete from permissions
where code = 'manage_calendar';
