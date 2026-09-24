-- cross-module read; replace with academic/identity/school reader
-- interfaces after merge. Every query in this file reads a table owned by
-- another module (academic: enrollments/schedules/classes/subjects/periods;
-- identity: duty_assignments/duty_types; platform: tenants), built in
-- parallel in other worktrees. Names are suffixed "ForAttendance" to avoid
-- colliding with those modules' own sqlc queries over the same tables once
-- all are merged into one generated db package.

-- name: ListActiveEnrollmentsForAttendance :many
-- Every actively enrolled student of a class, with the display name, NIS,
-- and guardian contact the roster and reports need -- the same shape
-- scheduling's own cross-module reads use for ClassRef/SubjectRef.
select
  en.student_user_id,
  u.name,
  sp.nis,
  sp.guardian_name,
  sp.guardian_phone
from enrollments en
join users u on u.id = en.student_user_id
left join student_profiles sp on sp.user_id = en.student_user_id
where en.tenant_id = $1 and en.academic_year_id = $2 and en.class_id = $3 and en.status = 'active'
order by u.name;

-- name: GetEnrolledClassForAttendance :one
-- The class a student is actively enrolled in this academic year, for the
-- student calendar and monthly summary views, which take a student_user_id
-- rather than a class_id.
select class_id
from enrollments
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3 and status = 'active'
limit 1;

-- name: GetHomeroomClassForAttendance :one
-- The class a teacher is homeroom (wali kelas) duty holder of this
-- academic year, if any -- duty slug "homeroom", scope_class_id per
-- docs/analysis/backend-inventory.md section 1.9's global-corrector rule.
select da.scope_class_id
from duty_assignments da
join duty_types dt on dt.id = da.duty_type_id
where da.tenant_id = $1
  and da.academic_year_id = $2
  and da.user_id = $3
  and dt.slug = 'homeroom'
  and da.is_active
  and dt.is_active
  and da.scope_class_id is not null
  and da.starts_on <= current_date
  and (da.ends_on is null or da.ends_on >= current_date)
limit 1;

-- name: GetTenantTimezoneForAttendance :one
select timezone from tenants where id = $1;

-- name: ListCurrentPeriodScheduleCardsForAttendance :many
-- Every schedule occurrence whose period is currently running (start
-- period's starts_at through end period's ends_at straddle now_time, in
-- the tenant's own timezone), left-joined with today's attendance session
-- if one has been opened -- the raw input to the monitor snapshot's
-- per-class submission cards. Also carries the governing period's own
-- name/times (the monitor's "current period" banner is this period,
-- shared by every card since they all resolved against the same
-- now_time) and, when a substitute took the session, their name.
select
  s.class_id,
  c.name as class_name,
  s.subject_id,
  sub.name as subject_name,
  s.teacher_user_id,
  tu.name as teacher_name,
  ats.id as session_id,
  ats.submitted_at,
  ats.substitute_user_id,
  su.name as substitute_name,
  sp.name as period_name,
  sp.starts_at as period_starts_at,
  ep.ends_at as period_ends_at
from schedules s
join classes c on c.id = s.class_id
join subjects sub on sub.id = s.subject_id
join users tu on tu.id = s.teacher_user_id
join periods sp on sp.id = s.start_period_id
join periods ep on ep.id = s.end_period_id
left join attendance_sessions ats on ats.schedule_id = s.id and ats.date = $4
left join users su on su.id = ats.substitute_user_id
where s.tenant_id = $1 and s.academic_year_id = $2 and s.day_of_week = $3
  and sp.starts_at <= $5 and ep.ends_at >= $5
order by c.name;

-- name: ListClassesWithoutCurrentPeriodScheduleForAttendance :many
-- Every non-deleted class of the academic year that has no schedule row
-- straddling now_time on day_of_week -- the monitor snapshot shows these
-- as "no schedule" cards instead of silently omitting them.
select c.id as class_id, c.name as class_name
from classes c
where c.tenant_id = $1 and c.academic_year_id = $2 and c.deleted_at is null
  and not exists (
    select 1
    from schedules s
    join periods sp on sp.id = s.start_period_id
    join periods ep on ep.id = s.end_period_id
    where s.tenant_id = $1 and s.academic_year_id = $2 and s.class_id = c.id and s.day_of_week = $3
      and sp.starts_at <= $4 and ep.ends_at >= $4
  )
order by c.name;

-- name: GetGradeLevelNameForAttendance :one
-- One grade level's display name, for the grade-level ("angkatan") scope
-- of a report export's scope line ("Angkatan: <name>").
select name from grade_levels where tenant_id = $1 and id = $2;

-- name: GetClassNameForAttendance :one
-- One class's display name, for the class scope of a report export (the
-- grade-level scope already gets every class's name from
-- ListClassesByGradeLevelForAttendance below).
select name from classes where tenant_id = $1 and id = $2;

-- name: ListClassesByGradeLevelForAttendance :many
-- Every non-deleted class of the academic year in grade_level_id, ordered
-- by name -- the grade-level ("angkatan") scope for attendance report
-- exports: one section per class, matching
-- academic.AcademicListClassesByYearAndGradeLevel's own scoping rule.
select c.id as class_id, c.name as class_name
from classes c
where c.tenant_id = $1 and c.academic_year_id = $2 and c.grade_level_id = $3 and c.deleted_at is null
order by c.name;

-- name: CountDailySummaryStatusesForAttendance :many
select status_code, count(*)::bigint as total
from attendance_daily_summary
where tenant_id = $1 and academic_year_id = $2 and date = $3
group by status_code;

-- name: ListGuardianUserIDsForAttendance :many
-- Every parent/guardian linked to a student, for the attendance.submitted
-- event's Subject (docs/02-system-design.md:110).
select parent_user_id
from parent_students
where tenant_id = $1 and student_user_id = $2;

-- name: GetUserNameForAttendance :one
select name from users where tenant_id = $1 and id = $2;

-- name: ListSessionDetailsForClassDateAttendance :many
-- The per-session detail rows behind the daily report (docs/analysis/
-- backend-inventory.md section 1.10's "detail per jadwal x siswa"): every
-- session already opened for a class on a date, with the subject/teacher/
-- period names a report needs, ordered by when the period runs.
select
  ats.id as session_id,
  ats.subject_id,
  sub.name as subject_name,
  ats.teacher_user_id,
  tu.name as teacher_name,
  sp.name as start_period_name,
  ep.name as end_period_name,
  ats.submitted_at
from attendance_sessions ats
join subjects sub on sub.id = ats.subject_id
join users tu on tu.id = ats.teacher_user_id
join periods sp on sp.id = ats.start_period_id
join periods ep on ep.id = ats.end_period_id
where ats.tenant_id = $1 and ats.class_id = $2 and ats.date = $3
order by sp.sequence;

-- name: ListOwnSubmittedSessionDetailsForAttendance :many
-- The "own sessions" report scope (docs/analysis/backend-inventory.md
-- section 1.10): every session teacherUserID submitted on a date, whether
-- as the schedule's own teacher or an accepted substitute, with the
-- class/subject/period names a report needs.
select
  ats.id as session_id,
  ats.class_id,
  c.name as class_name,
  ats.subject_id,
  sub.name as subject_name,
  ats.teacher_user_id,
  tu.name as teacher_name,
  sp.name as start_period_name,
  ep.name as end_period_name,
  ats.submitted_at
from attendance_sessions ats
join classes c on c.id = ats.class_id
join subjects sub on sub.id = ats.subject_id
join users tu on tu.id = ats.teacher_user_id
join periods sp on sp.id = ats.start_period_id
join periods ep on ep.id = ats.end_period_id
where ats.tenant_id = $1 and ats.date = $2
  and (ats.teacher_user_id = $3 or ats.substitute_user_id = $3)
  and ats.submitted_at is not null
order by sp.sequence;
