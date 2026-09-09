-- name: CreateCounseling :one
insert into counselings (tenant_id, academic_year_id, student_user_id, counselor_user_id, session_at, kind, title,
  content_encrypted, content_key_id, follow_up_plan_encrypted, visibility)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
returning *;

-- name: UpdateCounseling :one
update counselings set session_at = $3, kind = $4, title = $5, content_encrypted = $6, content_key_id = $7,
  follow_up_plan_encrypted = $8, visibility = $9
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

-- name: DeleteCounseling :exec
delete from counselings where tenant_id = $1 and id = $2;
