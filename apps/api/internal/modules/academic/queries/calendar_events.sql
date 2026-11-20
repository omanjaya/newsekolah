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

-- name: AcademicListNonTeachingEventsInRange :many
-- Every non-teaching calendar event (holiday, no_school, semester_break)
-- overlapping [from_date, to_date], with the grade levels it targets
-- (empty for a school-wide event), so a caller can answer "is this a
-- school day" for a whole date range in one read instead of one
-- AcademicListCalendarEventsForDate per date.
select
  e.id, e.date, e.end_date, e.kind, e.name,
  coalesce(array_agg(gl.grade_level_id) filter (where gl.grade_level_id is not null), '{}')::uuid[] as grade_level_ids
from academic_calendar_events e
left join academic_calendar_event_grade_levels gl
  on gl.tenant_id = e.tenant_id and gl.calendar_event_id = e.id
where e.tenant_id = $1 and e.academic_year_id = $2
  and e.kind in ('holiday', 'no_school', 'semester_break')
  and e.date <= sqlc.arg('to_date')::date and e.end_date >= sqlc.arg('from_date')::date
group by e.id
order by e.date;

-- name: AcademicReplaceCalendarEventGradeLevels :exec
delete from academic_calendar_event_grade_levels where tenant_id = $1 and calendar_event_id = $2;

-- name: AcademicAddCalendarEventGradeLevel :exec
insert into academic_calendar_event_grade_levels (tenant_id, calendar_event_id, grade_level_id)
values ($1, $2, $3);

-- name: AcademicListCalendarEventGradeLevels :many
select grade_level_id from academic_calendar_event_grade_levels
where tenant_id = $1 and calendar_event_id = $2
order by grade_level_id;
