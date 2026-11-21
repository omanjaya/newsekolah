-- name: UpsertAttendanceEntry :one
insert into attendance_entries (tenant_id, session_id, student_user_id, status_code, source, notes, recorded_by)
values ($1, $2, $3, $4, $5, $6, $7)
on conflict (session_id, student_user_id)
do update set status_code = excluded.status_code, source = excluded.source, notes = excluded.notes,
  recorded_by = excluded.recorded_by, updated_at = now()
returning *;

-- name: ListEntriesBySession :many
select * from attendance_entries where tenant_id = $1 and session_id = $2;

-- name: ListEntryReportRowsBySessions :many
-- Batch read behind the daily report: every entry of every given session
-- with the student's display name, in one round trip instead of one entries
-- query per session plus one name lookup per student. left_class marks an
-- entry of a student no longer actively enrolled in the session's class
-- (moved or left since): the entry stays a true record of that lesson,
-- but the report's student table -- the class's current roster -- no
-- longer lists them, so the detail says why the name is there. Those rows
-- come after the current roster's. source lets the report read a permit's
-- machine note ("leave letter <number>") as the web localizes it.
select e.session_id, e.student_user_id, e.status_code, e.source, e.notes, coalesce(u.name, '')::text as student_name,
  (not exists (
    select 1 from enrollments en
    where en.tenant_id = e.tenant_id and en.class_id = s.class_id and en.academic_year_id = s.academic_year_id
      and en.student_user_id = e.student_user_id and en.status = 'active'
  ))::boolean as left_class
from attendance_entries e
join attendance_sessions s on s.tenant_id = e.tenant_id and s.id = e.session_id
left join users u on u.tenant_id = e.tenant_id and u.id = e.student_user_id
where e.tenant_id = $1 and e.session_id = any(sqlc.arg(session_ids)::uuid[])
order by e.session_id, left_class, u.name, e.student_user_id;

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

-- name: ListEntryStatusesForStudentsDates :many
-- Batch form of ListEntryStatusesForStudentDate: every status code recorded
-- for each (student, date) across that date's submitted sessions, the raw
-- input to attendance/domain.ComputeDailyStatus.
select e.student_user_id, s.date, array_agg(e.status_code)::text[] as status_codes
from attendance_entries e
join attendance_sessions s on s.id = e.session_id
where e.tenant_id = $1 and e.student_user_id = any(sqlc.arg(student_ids)::uuid[])
  and s.date = any(sqlc.arg(dates)::date[]) and s.submitted_at is not null
group by e.student_user_id, s.date;
