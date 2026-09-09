-- name: UpsertReportScore :one
insert into report_scores (tenant_id, academic_year_id, term_id, class_id, subject_id, student_user_id, previous_score, manual_score, final_score, computed_at)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
on conflict (academic_year_id, term_id, class_id, subject_id, student_user_id) do update
  set previous_score = excluded.previous_score,
      manual_score = coalesce(excluded.manual_score, report_scores.manual_score),
      final_score = excluded.final_score, computed_at = now()
returning *;

-- name: SetManualReportScore :one
update report_scores set manual_score = $7, final_score = coalesce($7, final_score), computed_at = now()
where tenant_id = $1 and term_id = $2 and class_id = $3 and subject_id = $4 and student_user_id = $5 and academic_year_id = $6
returning *;

-- name: ListReportScores :many
select * from report_scores
where tenant_id = $1 and term_id = $2 and class_id = $3 and subject_id = $4
order by student_user_id;

-- name: ListReportScoresForStudent :many
select * from report_scores
where tenant_id = $1 and term_id = $2 and student_user_id = $3
order by subject_id;

-- name: ListGradeRanges :many
select * from report_grade_ranges
where tenant_id = $1 and academic_year_id = $2
  and (subject_id is null or subject_id = sqlc.narg(subject_id)::uuid)
  and (teacher_user_id is null or teacher_user_id = sqlc.narg(teacher_user_id)::uuid)
order by min_score;

-- name: ListAllGradeRanges :many
select * from report_grade_ranges where tenant_id = $1 and academic_year_id = $2 order by subject_id nulls first, min_score;

-- name: CreateGradeRange :one
insert into report_grade_ranges (tenant_id, academic_year_id, subject_id, teacher_user_id, min_score, max_score, increase_amount)
values ($1, $2, $3, $4, $5, $6, $7)
returning *;

-- name: DeleteGradeRange :exec
delete from report_grade_ranges where tenant_id = $1 and id = $2;

-- name: UpsertTPMapping :one
insert into report_tp_mappings (tenant_id, component_id, export_code, r_min, r_max, t_min, t_max)
values ($1, $2, $3, $4, $5, $6, $7)
on conflict (component_id) do update set export_code = excluded.export_code, r_min = excluded.r_min, r_max = excluded.r_max, t_min = excluded.t_min, t_max = excluded.t_max
returning *;

-- name: ListTPMappings :many
select m.* from report_tp_mappings m
where m.tenant_id = $1 and m.component_id = any(sqlc.arg(component_ids)::uuid[]);

-- name: InsertStarEvent :one
insert into star_events (tenant_id, academic_year_id, class_id, subject_id, student_user_id, teacher_user_id, delta, note, visible_to_student)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
returning *;

-- name: StarBalance :one
select coalesce(sum(delta), 0)::int as balance from star_events
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3;

-- name: ListStarEventsForStudent :many
select * from star_events
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3
  and (sqlc.arg(include_hidden)::bool or visible_to_student)
order by created_at desc
limit $4;

-- name: ListStarBalancesForClass :many
select student_user_id, coalesce(sum(delta), 0)::int as balance from star_events
where tenant_id = $1 and academic_year_id = $2 and class_id = $3
group by student_user_id
order by balance desc;
