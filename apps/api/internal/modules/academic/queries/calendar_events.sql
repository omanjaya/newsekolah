-- name: AcademicCreateCalendarEvent :one
insert into academic_calendar_events (tenant_id, academic_year_id, date, end_date, kind, name)
values ($1, $2, $3, $4, $5, $6)
returning *;

-- name: AcademicUpdateCalendarEvent :one
update academic_calendar_events
set date = $3, end_date = $4, kind = $5, name = $6
where tenant_id = $1 and id = $2
returning *;

-- name: AcademicGetCalendarEventByID :one
select * from academic_calendar_events where tenant_id = $1 and id = $2;

-- name: AcademicDeleteCalendarEvent :exec
delete from academic_calendar_events where tenant_id = $1 and id = $2;

-- name: AcademicListCalendarEvents :many
select sqlc.embed(academic_calendar_events), count(*) over () as total_count
from academic_calendar_events
where tenant_id = $1 and academic_year_id = $2
  and (sqlc.narg('kind')::text is null or kind = sqlc.narg('kind'))
order by date
limit $3 offset $4;

-- name: AcademicListCalendarEventsForDate :many
-- Every non-teaching calendar event (holiday, no_school, semester_break)
-- whose [date, end_date] range covers the given date, for
-- domain.IsSchoolDay to evaluate against a grade level.
select * from academic_calendar_events
where tenant_id = $1 and academic_year_id = $2
  and kind in ('holiday', 'no_school', 'semester_break')
  and date <= $3 and end_date >= $3;

-- name: AcademicReplaceCalendarEventGradeLevels :exec
delete from academic_calendar_event_grade_levels where tenant_id = $1 and calendar_event_id = $2;

-- name: AcademicAddCalendarEventGradeLevel :exec
insert into academic_calendar_event_grade_levels (tenant_id, calendar_event_id, grade_level_id)
values ($1, $2, $3);

-- name: AcademicListCalendarEventGradeLevels :many
select grade_level_id from academic_calendar_event_grade_levels
where tenant_id = $1 and calendar_event_id = $2
order by grade_level_id;
