-- name: AcademicCreateCalendarEvent :one
insert into academic_calendar_events (tenant_id, academic_year_id, date, kind, name)
values ($1, $2, $3, $4, $5)
returning *;

-- name: AcademicUpdateCalendarEvent :one
update academic_calendar_events
set date = $3, kind = $4, name = $5
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
