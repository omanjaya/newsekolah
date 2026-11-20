-- The teacher (Guru) system role now holds manage_mentoring (the guru
-- wali's own groups: snapshot, meeting notes, term summaries) and
-- record_extracurricular_attendance (the pembina's own clubs: meetings and
-- attendance). Neither is school-wide: the mentoring service scopes the
-- first to the groups the teacher mentors, the activities service the
-- second to the clubs the teacher coaches. Before this, an assigned mentor
-- or coach got 403 on their own group or club and a school admin could
-- not fix it (editing role permissions needs manage_permissions).
--
-- Both permission codes predate this migration, so only role_permissions
-- changes. Mirrors RoleDefaults()'s teacher entry for every tenant that
-- already has the system role. Idempotent, and a no-op on a brand-new
-- database.
insert into role_permissions (role_id, permission_code, tenant_id)
select roles.id, codes.code, roles.tenant_id
from roles
cross join (values ('manage_mentoring'), ('record_extracurricular_attendance')) as codes (code)
where roles.slug = 'teacher' and roles.is_system = true
on conflict (role_id, permission_code) do nothing;
