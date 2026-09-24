-- name: UpsertAttendanceEntry :one
insert into attendance_entries (tenant_id, session_id, student_user_id, status_code, source, notes, recorded_by)
values ($1, $2, $3, $4, $5, $6, $7)
on conflict (session_id, student_user_id)
do update set status_code = excluded.status_code, source = excluded.source, notes = excluded.notes,
  recorded_by = excluded.recorded_by, updated_at = now()
returning *;

-- name: ListEntriesBySession :many
select * from attendance_entries where tenant_id = $1 and session_id = $2;

-- name: GetEntryBySessionStudent :one
select * from attendance_entries where tenant_id = $1 and session_id = $2 and student_user_id = $3;

-- name: ListEntryStatusesForStudentDate :many
-- Every status code recorded for one student across the given date's
-- submitted sessions -- the raw input to attendance/domain.ComputeDailyStatus.
select e.status_code
from attendance_entries e
join attendance_sessions s on s.id = e.session_id
where e.tenant_id = $1 and e.student_user_id = $2 and s.date = $3 and s.submitted_at is not null;

-- name: GetPreviousEntryForStudent :one
-- The student's most recent recorded status in this class+subject before
-- the given date, used to prefill "previous_status" in the session payload.
select e.status_code
from attendance_entries e
join attendance_sessions s on s.id = e.session_id
where e.tenant_id = $1 and e.student_user_id = $2 and s.class_id = $3 and s.subject_id = $4 and s.date < $5
order by s.date desc
limit 1;

-- name: CountEntryStatusesForStudentsInYear :many
-- Every roster student's per-status entry count across the whole
-- academic year (every class and subject, not just this one), the
-- roster's "N Sakit, N Izin, ..." recap: one aggregate query for the
-- whole class rather than one round trip per student.
select e.student_user_id, e.status_code, count(*)::bigint as total
from attendance_entries e
join attendance_sessions s on s.id = e.session_id
where e.tenant_id = $1 and s.academic_year_id = $2 and e.student_user_id = any(sqlc.arg(student_ids)::uuid[])
group by e.student_user_id, e.status_code;
