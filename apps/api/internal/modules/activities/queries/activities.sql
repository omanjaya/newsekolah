-- name: CreateActivity :one
insert into school_activities (tenant_id, academic_year_id, name, description, location, start_date, end_date, organiser_user_id)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: GetActivity :one
select * from school_activities where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: UpdateActivity :one
update school_activities set
  name = $3, description = $4, location = $5, start_date = $6, end_date = $7, organiser_user_id = $8
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;

-- name: DeleteActivity :exec
update school_activities set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: ListActivities :many
select * from school_activities
where tenant_id = $1 and academic_year_id = $2 and deleted_at is null
  and (sqlc.narg(from_date)::date is null or end_date >= sqlc.narg(from_date)::date)
  and (sqlc.narg(to_date)::date is null or start_date <= sqlc.narg(to_date)::date)
order by start_date;

-- name: AddParticipant :one
insert into activity_participants (tenant_id, activity_id, class_id, grade_level_id, student_user_id)
values ($1, $2, $3, $4, $5)
returning *;

-- name: RemoveParticipant :exec
delete from activity_participants where tenant_id = $1 and id = $2;

-- name: ListParticipants :many
select * from activity_participants where tenant_id = $1 and activity_id = $2 order by created_at;

-- name: CreateAchievement :one
insert into student_achievements (tenant_id, academic_year_id, student_user_id, competition_name, level, placement, achieved_on, notes, created_by)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
returning *;

-- name: GetAchievement :one
select * from student_achievements where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: UpdateAchievement :one
update student_achievements set
  competition_name = $3, level = $4, placement = $5, achieved_on = $6, notes = $7
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;

-- name: DeleteAchievement :exec
update student_achievements set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: ListAchievements :many
select sa.* from student_achievements sa
where sa.tenant_id = $1 and sa.academic_year_id = $2 and sa.deleted_at is null
  and (sqlc.narg(student_id)::uuid is null or sa.student_user_id = sqlc.narg(student_id)::uuid)
  and (sqlc.narg(class_id)::uuid is null or exists (
    select 1 from enrollments e where e.tenant_id = sa.tenant_id and e.academic_year_id = sa.academic_year_id
      and e.student_user_id = sa.student_user_id and e.class_id = sqlc.narg(class_id)::uuid and e.status = 'active'))
order by sa.achieved_on desc;
