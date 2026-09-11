-- name: CreateCounseling :one
insert into counselings (tenant_id, academic_year_id, student_user_id, counselor_user_id, session_at, kind, topic, title,
  content_encrypted, content_key_id, follow_up_plan_encrypted, career_goals_encrypted, problem_description_encrypted, visibility)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
returning *;

-- name: UpdateCounseling :one
update counselings set session_at = $3, kind = $4, topic = $5, title = $6, content_encrypted = $7, content_key_id = $8,
  follow_up_plan_encrypted = $9, career_goals_encrypted = $10, problem_description_encrypted = $11, visibility = $12
where tenant_id = $1 and id = $2
returning *;

-- name: GetCounseling :one
select * from counselings where tenant_id = $1 and id = $2;

-- name: ListCounselingsForStudent :many
select * from counselings
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3
order by session_at desc;

-- name: ListCounselingsByCounselor :many
select * from counselings
where tenant_id = $1 and academic_year_id = $2 and counselor_user_id = $3
order by session_at desc
limit $4 offset $5;

-- name: ListCounselingsByVisibility :many
-- Cross-student view for any counselor (duty "counselor"): every note the
-- author chose to share with the whole BK team, optionally by topic.
select * from counselings
where tenant_id = $1 and academic_year_id = $2 and visibility = 'bk_team'
  and (sqlc.narg(topic)::text is null or topic = sqlc.narg(topic))
order by session_at desc
limit $3 offset $4;

-- name: DeleteCounseling :exec
delete from counselings where tenant_id = $1 and id = $2;

-- name: CreateCounselingAttachment :one
insert into counseling_attachments (tenant_id, counseling_id, asset_id)
values ($1, $2, $3)
returning *;

-- name: ListCounselingAttachments :many
select * from counseling_attachments where tenant_id = $1 and counseling_id = $2 order by created_at;

-- name: GetCounselingAttachment :one
select * from counseling_attachments where tenant_id = $1 and id = $2;
