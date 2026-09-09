-- name: CreateWarningLetter :one
insert into warning_letters (tenant_id, academic_year_id, student_user_id, level, level_label, threshold_points, total_points,
  letter_number, issued_by, snapshot, document_asset_id)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
returning *;

-- name: ListWarningLettersForStudent :many
select * from warning_letters
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3
order by level;

-- name: GetWarningLetter :one
select * from warning_letters where tenant_id = $1 and id = $2;

-- name: ListWarningLetters :many
select wl.* from warning_letters wl
where wl.tenant_id = $1 and wl.academic_year_id = $2
  and (sqlc.narg(class_id)::uuid is null or exists (
    select 1 from enrollments e where e.tenant_id = wl.tenant_id and e.academic_year_id = wl.academic_year_id
      and e.student_user_id = wl.student_user_id and e.class_id = sqlc.narg(class_id)::uuid and e.status = 'active'))
order by wl.issued_at desc
limit $3 offset $4;
