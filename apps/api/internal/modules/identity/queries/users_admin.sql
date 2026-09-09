-- name: UsernameExists :one
select exists(select 1 from users where tenant_id = sqlc.arg(tenant_id) and username = sqlc.arg(username));

-- name: EmailExists :one
select exists(
  select 1 from users
  where tenant_id = sqlc.arg(tenant_id) and email = sqlc.arg(email) and email is not null
);

-- name: ListUsersAdmin :many
select u.*, up.kind as profile_kind
from users u
left join user_profiles up on up.user_id = u.id
where u.tenant_id = sqlc.arg(tenant_id)
  and (sqlc.arg(include_archived)::bool or u.deleted_at is null)
  and (
    sqlc.arg(search)::text = ''
    or u.name ilike '%' || sqlc.arg(search) || '%'
    or u.username ilike '%' || sqlc.arg(search) || '%'
    or exists (
      select 1 from student_profiles sp where sp.user_id = u.id and sp.nis ilike '%' || sqlc.arg(search) || '%'
    )
    or exists (
      select 1 from teacher_profiles tp where tp.user_id = u.id and tp.nip ilike '%' || sqlc.arg(search) || '%'
    )
  )
  and (sqlc.narg(status)::text is null or u.status = sqlc.narg(status))
  and (sqlc.narg(profile_kind)::text is null or up.kind = sqlc.narg(profile_kind))
  and (
    sqlc.narg(role_slug)::text is null
    or exists (
      select 1 from user_roles ur join roles r on r.id = ur.role_id
      where ur.user_id = u.id and r.slug = sqlc.narg(role_slug)
    )
  )
  and (sqlc.narg(cursor_id)::uuid is null or u.id > sqlc.narg(cursor_id))
order by u.id
limit sqlc.arg(page_limit);

-- name: GetUserAdminByID :one
select u.*, up.kind as profile_kind
from users u
left join user_profiles up on up.user_id = u.id
where u.tenant_id = sqlc.arg(tenant_id) and u.id = sqlc.arg(id);

-- name: GetStudentProfile :one
select * from student_profiles where tenant_id = $1 and user_id = $2;

-- name: GetTeacherProfile :one
select * from teacher_profiles where tenant_id = $1 and user_id = $2;

-- name: GetStaffProfile :one
select * from staff_profiles where tenant_id = $1 and user_id = $2;

-- name: UpdateUserBasic :exec
update users
set name = $3, email = $4, phone = $5, locale = $6
where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: SetUserStatus :exec
update users set status = $3 where tenant_id = $1 and id = $2;

-- name: ArchiveUser :exec
update users set status = 'inactive', deleted_at = now() where tenant_id = $1 and id = $2;

-- name: RestoreUser :exec
update users set status = 'active', deleted_at = null where tenant_id = $1 and id = $2;

-- name: UpsertUserProfile :exec
insert into user_profiles (
  user_id, tenant_id, kind, nik, gender, birth_place, birth_date, religion, address, district, city, blood_type
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
)
on conflict (user_id) do update set
  kind = excluded.kind, nik = excluded.nik, gender = excluded.gender, birth_place = excluded.birth_place,
  birth_date = excluded.birth_date, religion = excluded.religion, address = excluded.address,
  district = excluded.district, city = excluded.city, blood_type = excluded.blood_type;

-- name: UpsertStudentProfile :exec
insert into student_profiles (
  user_id, tenant_id, nis, nisn, entry_year, previous_school, father_name, mother_name,
  guardian_name, guardian_phone, parent_occupation
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
)
on conflict (user_id) do update set
  nis = excluded.nis, nisn = excluded.nisn, entry_year = excluded.entry_year,
  previous_school = excluded.previous_school, father_name = excluded.father_name,
  mother_name = excluded.mother_name, guardian_name = excluded.guardian_name,
  guardian_phone = excluded.guardian_phone, parent_occupation = excluded.parent_occupation;

-- name: UpsertTeacherProfile :exec
insert into teacher_profiles (
  user_id, tenant_id, nip, nuptk, employment_status, last_education, joined_year, specialization
) values (
  $1, $2, $3, $4, $5, $6, $7, $8
)
on conflict (user_id) do update set
  nip = excluded.nip, nuptk = excluded.nuptk, employment_status = excluded.employment_status,
  last_education = excluded.last_education, joined_year = excluded.joined_year,
  specialization = excluded.specialization;

-- name: UpsertStaffProfile :exec
insert into staff_profiles (
  user_id, tenant_id, employee_number, position, employment_status, last_education, joined_year
) values (
  $1, $2, $3, $4, $5, $6, $7
)
on conflict (user_id) do update set
  employee_number = excluded.employee_number, position = excluded.position,
  employment_status = excluded.employment_status, last_education = excluded.last_education,
  joined_year = excluded.joined_year;

-- name: DeleteUserRoles :exec
delete from user_roles where tenant_id = $1 and user_id = $2;

-- name: ListUserRoleSlugs :many
select r.slug from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1;

-- name: SetUserAvatarAsset :exec
update users set avatar_asset_id = $3 where tenant_id = $1 and id = $2;
