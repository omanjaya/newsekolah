-- name: MentoringGetGroupSizeLimit :one
select group_size_limit from mentor_group_settings where tenant_id = $1;

-- name: MentoringUpsertGroupSizeLimit :exec
insert into mentor_group_settings (tenant_id, group_size_limit)
values ($1, $2)
on conflict (tenant_id) do update set group_size_limit = excluded.group_size_limit, updated_at = now();

-- name: MentoringCreateGroup :one
insert into mentor_groups (tenant_id, academic_year_id, mentor_user_id, name)
values ($1, $2, $3, $4)
returning *;

-- name: MentoringGetGroup :one
select * from mentor_groups where tenant_id = $1 and id = $2;

-- name: MentoringListGroupsForMentor :many
select * from mentor_groups
where tenant_id = $1 and academic_year_id = $2 and mentor_user_id = $3
order by name;

-- name: MentoringListGroupsForYear :many
select * from mentor_groups where tenant_id = $1 and academic_year_id = $2 order by name;

-- name: MentoringUpdateGroup :one
update mentor_groups set name = $3, mentor_user_id = $4
where tenant_id = $1 and id = $2
returning *;

-- name: MentoringDeleteGroup :exec
delete from mentor_groups where tenant_id = $1 and id = $2;

-- name: MentoringCountGroupMembers :one
select count(*) from mentor_group_members where tenant_id = $1 and group_id = $2;

-- name: MentoringAddGroupMember :one
insert into mentor_group_members (tenant_id, group_id, academic_year_id, student_user_id)
values ($1, $2, $3, $4)
returning *;

-- name: MentoringRemoveGroupMember :exec
delete from mentor_group_members where tenant_id = $1 and group_id = $2 and student_user_id = $3;

-- name: MentoringListGroupMembers :many
select * from mentor_group_members where tenant_id = $1 and group_id = $2 order by assigned_at;

-- name: MentoringFindMembershipForStudent :one
select * from mentor_group_members
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3;
