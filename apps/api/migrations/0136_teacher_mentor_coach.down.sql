-- Reverses 0136_teacher_mentor_coach.up.sql: the teacher system role's
-- manage_mentoring and record_extracurricular_attendance grants. The
-- permission codes themselves stay in the catalog: they predate it.
delete from role_permissions
using roles
where role_permissions.role_id = roles.id
  and roles.slug = 'teacher' and roles.is_system = true
  and role_permissions.permission_code in ('manage_mentoring', 'record_extracurricular_attendance');
