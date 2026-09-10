-- name: MentoringUpsertTermSummary :one
insert into mentor_term_summaries (tenant_id, term_id, group_id, student_user_id, mentor_user_id, summary)
values ($1, $2, $3, $4, $5, $6)
on conflict (term_id, student_user_id)
do update set summary = excluded.summary, mentor_user_id = excluded.mentor_user_id, updated_at = now()
returning *;

-- name: MentoringGetTermSummary :one
select * from mentor_term_summaries where tenant_id = $1 and term_id = $2 and student_user_id = $3;

-- name: MentoringListTermSummariesForGroup :many
select * from mentor_term_summaries where tenant_id = $1 and term_id = $2 and group_id = $3 order by student_user_id;
