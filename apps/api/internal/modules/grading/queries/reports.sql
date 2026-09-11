-- name: UpsertReportScore :one
-- automatic_score always reflects the latest weighted-average
-- computation; final_score is the manual override when one is set
-- (either passed here or already on the row), otherwise it mirrors
-- automatic_score. This is what lets SetManualReportScore restore the
-- automatic value by clearing the override, without a full recompute.
insert into report_scores (tenant_id, academic_year_id, term_id, class_id, subject_id, student_user_id, previous_score, manual_score, automatic_score, final_score, computed_at)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($8::numeric, $9::numeric), now())
on conflict (academic_year_id, term_id, class_id, subject_id, student_user_id) do update
  set previous_score = excluded.previous_score,
      manual_score = coalesce(excluded.manual_score, report_scores.manual_score),
      automatic_score = excluded.automatic_score,
      final_score = coalesce(coalesce(excluded.manual_score, report_scores.manual_score), excluded.automatic_score),
      computed_at = now()
returning *;

-- name: SetManualReportScore :one
update report_scores set manual_score = $7, final_score = coalesce($7, automatic_score), computed_at = now()
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

-- name: ReplaceGradeRangesScope :exec
-- Deletes every range of one subject-teacher scope before the caller
-- re-inserts the replacement set (the "aturan nilai rapor" save action,
-- grading_extended.go:140). `is not distinct from` treats a null
-- teacher_user_id (a school-wide range) as its own scope rather than
-- matching every teacher's ranges.
delete from report_grade_ranges
where tenant_id = $1 and academic_year_id = $2 and subject_id = $3
  and teacher_user_id is not distinct from sqlc.narg(teacher_user_id)::uuid;

-- name: UpsertTPMapping :one
insert into report_tp_mappings (tenant_id, component_id, export_code, r_min, r_max, t_min, t_max)
values ($1, $2, $3, $4, $5, $6, $7)
on conflict (component_id) do update set export_code = excluded.export_code, r_min = excluded.r_min, r_max = excluded.r_max, t_min = excluded.t_min, t_max = excluded.t_max
returning *;

-- name: GetTPMapping :one
select * from report_tp_mappings where tenant_id = $1 and id = $2;

-- name: DeleteTPMapping :exec
delete from report_tp_mappings where tenant_id = $1 and id = $2;

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

-- name: VisibleStarBalance :one
-- The balance a student (or MyGrades) may see: events the teacher marked
-- visible_to_student only (grading_extended.go:653's "AND
-- e.visible_to_student=TRUE"). Hidden adjustments still count toward the
-- real (StarBalance) total a teacher works from.
select coalesce(sum(delta), 0)::int as balance from star_events
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3 and visible_to_student;

-- name: LockStarBalance :exec
-- A per-student advisory lock held for the rest of the transaction
-- (docs/06 section 9: "constraint saldo >= 0 ditegakkan service dengan
-- advisory lock per siswa"), so two concurrent star deductions cannot
-- both read the same balance and both pass the "stays >= 0" check.
select pg_advisory_xact_lock(hashtext($1::text), hashtext($2::text));

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

-- name: MyStarsGrouped :many
-- The student's own star breakdown (grading_extended.go:653's myStars):
-- visible events only, grouped by subject and teacher.
select e.subject_id, coalesce(sub.name, '') as subject_name, e.teacher_user_id, u.name as teacher_name,
       sum(e.delta)::int as total, max(e.created_at)::timestamptz as last_awarded_at
from star_events e
join users u on u.id = e.teacher_user_id and u.tenant_id = e.tenant_id
left join subjects sub on sub.id = e.subject_id and sub.tenant_id = e.tenant_id
where e.tenant_id = $1 and e.academic_year_id = $2 and e.student_user_id = $3 and e.visible_to_student
group by e.subject_id, sub.name, e.teacher_user_id, u.name
order by sub.name nulls last, u.name;
