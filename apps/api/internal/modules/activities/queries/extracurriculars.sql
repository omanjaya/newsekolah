-- name: ListExtracurriculars :many
select * from extracurriculars
where tenant_id = $1 and academic_year_id = $2 and deleted_at is null
  and (sqlc.arg(include_inactive)::bool or is_active)
order by name;

-- name: GetExtracurricular :one
select * from extracurriculars where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: CreateExtracurricular :one
insert into extracurriculars (tenant_id, academic_year_id, name, description, coach_user_id, capacity, meeting_day, meeting_start, meeting_end, location)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
returning *;

-- name: UpdateExtracurricular :one
update extracurriculars set
  name = $3, description = $4, coach_user_id = $5, capacity = $6,
  meeting_day = $7, meeting_start = $8, meeting_end = $9, location = $10, is_active = $11
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;

-- name: DeleteExtracurricular :exec
update extracurriculars set deleted_at = now(), is_active = false where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: CountActiveMembers :one
select count(*)::int from extracurricular_memberships
where tenant_id = $1 and extracurricular_id = $2 and status = 'active';

-- name: CountActiveClubsForStudent :one
select count(*)::int from extracurricular_memberships em
join extracurriculars e on e.id = em.extracurricular_id
where em.tenant_id = $1 and e.academic_year_id = $2 and em.student_user_id = $3 and em.status = 'active';

-- name: CreateMembership :one
insert into extracurricular_memberships (tenant_id, extracurricular_id, student_user_id, joined_on, status)
values ($1, $2, $3, $4, 'active')
returning *;

-- name: GetActiveMembership :one
select * from extracurricular_memberships
where tenant_id = $1 and extracurricular_id = $2 and student_user_id = $3 and status = 'active';

-- name: GetMembership :one
select * from extracurricular_memberships where tenant_id = $1 and id = $2;

-- name: EndMembership :one
update extracurricular_memberships set status = 'left', left_on = $3
where tenant_id = $1 and id = $2 and status = 'active'
returning *;

-- name: ListMembershipsForClub :many
select * from extracurricular_memberships
where tenant_id = $1 and extracurricular_id = $2
  and (sqlc.arg(include_left)::bool or status = 'active')
order by joined_on;

-- name: ListMembershipsForStudent :many
select em.*, e.name as club_name from extracurricular_memberships em
join extracurriculars e on e.id = em.extracurricular_id
where em.tenant_id = $1 and em.student_user_id = $2
order by em.joined_on desc;

-- name: GetLatestActivitiesPolicy :one
select version, config from activities_policies
where tenant_id = $1
order by version desc
limit 1;

-- name: CreateActivitiesPolicy :exec
insert into activities_policies (tenant_id, version, config, effective_from, created_by)
values ($1, $2, $3, $4, $5);
