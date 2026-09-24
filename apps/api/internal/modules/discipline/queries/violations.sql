-- name: ListViolationTypes :many
select * from violation_types
where tenant_id = $1 and deleted_at is null and (sqlc.arg(include_inactive)::bool or is_active)
  and (sqlc.narg(search)::text is null or name ilike '%' || sqlc.narg(search) || '%' or code ilike '%' || sqlc.narg(search) || '%')
order by category, points desc, name;

-- name: GetViolationType :one
select * from violation_types where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: CreateViolationType :one
insert into violation_types (tenant_id, code, name, points, category)
values ($1, $2, $3, $4, $5)
returning *;

-- name: UpdateViolationType :one
update violation_types set code = $3, name = $4, points = $5, category = $6, is_active = $7
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;

-- name: DeleteViolationType :exec
update violation_types set deleted_at = now(), is_active = false where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: CreateViolationRecord :one
insert into violation_records (tenant_id, academic_year_id, student_user_id, violation_type_id, points_snapshot, occurred_on,
  attendance_session_id, workflow_instance_id, reporter_user_id, notes)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
returning *;

-- name: GetViolationRecord :one
select * from violation_records where tenant_id = $1 and id = $2;

-- name: GetViolationRecordByWorkflow :one
-- Idempotency lookup for cross-module callers (attendance sessions, late
-- arrival review): a second call with the same (workflow_instance_id,
-- violation_type_id) returns the record already written instead of
-- creating a duplicate.
select * from violation_records
where tenant_id = $1 and workflow_instance_id = $2 and violation_type_id = $3;

-- name: DeleteViolationRecordsBySessionStudent :exec
-- Hard delete, not void: replacing an attendance session's per-student
-- violations on resave is delete-then-reinsert, matching the old system's
-- teacher_attendance.go L295-309, not an auditable void.
delete from violation_records
where tenant_id = $1 and attendance_session_id = $2 and student_user_id = $3;

-- name: VoidViolationRecord :one
update violation_records set voided_at = now(), voided_by = $3, void_reason = $4
where tenant_id = $1 and id = $2 and voided_at is null
returning *;

-- name: ListViolationRecordsForStudent :many
select vr.*, vt.code as type_code, vt.name as type_name, vt.category as type_category
from violation_records vr
join violation_types vt on vt.id = vr.violation_type_id
where vr.tenant_id = $1 and vr.academic_year_id = $2 and vr.student_user_id = $3
order by vr.occurred_on desc, vr.created_at desc;

-- name: ListViolationRecords :many
-- The admin list: optional class (via active enrollment) and date range filters.
select vr.*, vt.code as type_code, vt.name as type_name, vt.category as type_category
from violation_records vr
join violation_types vt on vt.id = vr.violation_type_id
where vr.tenant_id = $1 and vr.academic_year_id = $2
  and (sqlc.narg(class_id)::uuid is null or exists (
    select 1 from enrollments e where e.tenant_id = vr.tenant_id and e.academic_year_id = vr.academic_year_id
      and e.student_user_id = vr.student_user_id and e.class_id = sqlc.narg(class_id)::uuid and e.status = 'active'))
  and (sqlc.narg(from_date)::date is null or vr.occurred_on >= sqlc.narg(from_date)::date)
  and (sqlc.narg(to_date)::date is null or vr.occurred_on <= sqlc.narg(to_date)::date)
  and (sqlc.arg(include_voided)::bool or vr.voided_at is null)
order by vr.occurred_on desc, vr.created_at desc
limit $3 offset $4;

-- name: SumActivePoints :one
select coalesce(sum(points_snapshot), 0)::int as total
from violation_records
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3 and voided_at is null;

-- name: ListActivePointsByYear :many
-- Every active violation's points and date this year, for computing when
-- each student first crossed each SP threshold (the report's "Status SP"
-- column). Grouped by student in Go rather than SQL so the same policy
-- logic (SPPolicy.FirstCrossedDates) drives both the API summary and the
-- exported report.
select vr.student_user_id, vr.points_snapshot, vr.occurred_on
from violation_records vr
where vr.tenant_id = $1 and vr.academic_year_id = $2 and vr.voided_at is null
  and (sqlc.narg(class_id)::uuid is null or exists (
    select 1 from enrollments e where e.tenant_id = vr.tenant_id and e.academic_year_id = vr.academic_year_id
      and e.student_user_id = vr.student_user_id and e.class_id = sqlc.narg(class_id)::uuid and e.status = 'active'))
order by vr.student_user_id, vr.occurred_on;

-- name: ListStudentPointTotals :many
-- Points per student in a class this year, for the homeroom and counselor overview.
select vr.student_user_id, coalesce(sum(vr.points_snapshot), 0)::int as total, count(*)::int as record_count,
  max(vr.occurred_on)::date as last_occurred_on
from violation_records vr
where vr.tenant_id = $1 and vr.academic_year_id = $2 and vr.voided_at is null
  and (sqlc.narg(class_id)::uuid is null or exists (
    select 1 from enrollments e where e.tenant_id = vr.tenant_id and e.academic_year_id = vr.academic_year_id
      and e.student_user_id = vr.student_user_id and e.class_id = sqlc.narg(class_id)::uuid and e.status = 'active'))
group by vr.student_user_id
order by total desc
limit $3;

-- name: ListPointsPreviewForStudents :many
-- Live points preview while a teacher is still choosing violation types
-- (docs/15 "pratinjau ambang SP"): one round trip for every selected
-- student's current active total and the SP levels already issued,
-- mirroring CountEntryStatusesForStudentsInYear's one-query-per-roster
-- pattern (attendance/queries/entries.sql). A student absent from the
-- result has zero points and no issued levels.
select vr.student_user_id,
  coalesce(sum(vr.points_snapshot), 0)::int as total_points,
  coalesce(array_agg(distinct wl.level) filter (where wl.level is not null), '{}')::int[] as issued_levels
from violation_records vr
left join warning_letters wl on wl.tenant_id = vr.tenant_id and wl.academic_year_id = vr.academic_year_id
  and wl.student_user_id = vr.student_user_id
where vr.tenant_id = $1 and vr.academic_year_id = $2 and vr.voided_at is null
  and vr.student_user_id = any(sqlc.arg(student_ids)::uuid[])
group by vr.student_user_id;

-- name: CreateViolationAttachment :one
insert into violation_attachments (tenant_id, violation_record_id, asset_id)
values ($1, $2, $3)
returning *;

-- name: ListViolationAttachments :many
select * from violation_attachments where tenant_id = $1 and violation_record_id = $2 order by created_at;

-- name: GetViolationAttachment :one
select * from violation_attachments where tenant_id = $1 and id = $2;
