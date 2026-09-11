-- Read-only lookups against tables owned by the identity module (users,
-- student_profiles). Per the ownership convention already used for
-- cross-module reads (e.g. academic reads school's academic_years
-- directly), these are additive, read-only queries scoped to exactly what
-- class/enrollment management and Excel import need: no module here writes
-- to another module's table.

-- name: AcademicFindStudentByUsername :one
select u.id, u.name, u.username
from users u
join user_profiles up on up.user_id = u.id and up.kind = 'student'
where u.tenant_id = $1 and u.username = $2 and u.deleted_at is null;

-- name: AcademicIsActiveStudent :one
select exists (
  select 1 from users u
  join user_profiles up on up.user_id = u.id and up.kind = 'student'
  where u.tenant_id = $1 and u.id = $2 and u.deleted_at is null and u.status = 'active'
);

-- name: AcademicIsActiveTeacher :one
select exists (
  select 1 from users u
  join user_profiles up on up.user_id = u.id and up.kind = 'teacher'
  where u.tenant_id = $1 and u.id = $2 and u.deleted_at is null and u.status = 'active'
);

-- name: AcademicFindStudentByNIS :one
select u.id, u.name, u.username
from users u
join student_profiles sp on sp.user_id = u.id
where u.tenant_id = $1 and sp.tenant_id = $1 and sp.nis = $2 and u.deleted_at is null;

-- name: AcademicListUnassignedStudents :many
-- Every active student user in the tenant with no active enrollment in the
-- given academic year. Search matches name, username, email, NIS, or NISN.
select sqlc.embed(u), count(*) over () as total_count
from users u
join user_profiles up on up.user_id = u.id and up.kind = 'student'
left join student_profiles sp on sp.user_id = u.id
where u.tenant_id = $1
  and u.deleted_at is null
  and u.status = 'active'
  and (
    sqlc.narg('search')::text is null
    or u.name ilike '%' || sqlc.narg('search') || '%'
    or u.username ilike '%' || sqlc.narg('search') || '%'
    or u.email ilike '%' || sqlc.narg('search') || '%'
    or sp.nis ilike '%' || sqlc.narg('search') || '%'
    or sp.nisn ilike '%' || sqlc.narg('search') || '%'
  )
  and not exists (
    select 1 from enrollments e
    where e.tenant_id = $1 and e.academic_year_id = $2 and e.student_user_id = u.id and e.status = 'active'
  )
order by u.name
limit $3 offset $4;
