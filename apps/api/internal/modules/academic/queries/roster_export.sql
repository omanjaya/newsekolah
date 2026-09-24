-- Read-only lookups against tables owned by the identity module (users,
-- user_profiles, student_profiles), same convention as students_lookup.sql:
-- additive, read-only, scoped to exactly what the class roster export
-- needs (NIS, NISN, name, gender, birth place/date, guardian).

-- name: AcademicListClassRosterForExport :many
-- Every actively enrolled student of a class, with the full set of fields
-- a printed "daftar siswa" needs, ordered by name.
select
  u.id as student_user_id,
  u.name,
  coalesce(sp.nis, '') as nis,
  coalesce(sp.nisn, '') as nisn,
  up.gender,
  up.birth_place,
  up.birth_date,
  coalesce(sp.guardian_name, '') as guardian_name
from enrollments en
join users u on u.id = en.student_user_id and u.tenant_id = en.tenant_id
left join user_profiles up on up.user_id = u.id and up.tenant_id = u.tenant_id
left join student_profiles sp on sp.user_id = u.id and sp.tenant_id = u.tenant_id
where en.tenant_id = $1 and en.class_id = $2 and en.status = 'active'
order by u.name;
