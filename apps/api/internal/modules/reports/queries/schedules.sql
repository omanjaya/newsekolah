-- name: CreateReportSchedule :one
insert into report_schedules (tenant_id, report_kind, params, cadence, weekday, day_of_month, hour, recipients, enabled, created_by, format)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
returning *;

-- name: UpdateReportSchedule :one
update report_schedules
set report_kind = $3, params = $4, cadence = $5, weekday = $6, day_of_month = $7, hour = $8, recipients = $9, format = $10
where tenant_id = $1 and id = $2
returning *;

-- name: SetReportScheduleEnabled :one
update report_schedules set enabled = $3 where tenant_id = $1 and id = $2 returning *;

-- name: GetReportSchedule :one
select * from report_schedules where tenant_id = $1 and id = $2;

-- name: ListReportSchedules :many
select * from report_schedules where tenant_id = $1 order by created_at desc;

-- name: DeleteReportSchedule :exec
delete from report_schedules where tenant_id = $1 and id = $2;

-- name: ListEnabledReportSchedulesForHour :many
-- Fetches every enabled schedule due at this tenant-local hour, whatever
-- its cadence; the service filters weekday/day-of-month in Go (domain.
-- Schedule.IsDueAt) since the day-of-month clamp for short months is not
-- expressible as a plain column comparison.
select * from report_schedules where tenant_id = $1 and enabled and hour = $2;

-- name: ClaimReportScheduleRun :one
-- Inserts a pending run row for one due slot. The unique (schedule_id,
-- due_at) constraint makes this the run-once-per-slot guard: a second
-- wake-up in the same hour (or a retried job) finds zero rows returned
-- instead of erroring, and the caller treats that as "already claimed".
insert into report_schedule_runs (tenant_id, schedule_id, due_at, status)
values ($1, $2, $3, 'pending')
on conflict (schedule_id, due_at) do nothing
returning *;

-- name: CompleteReportScheduleRun :exec
update report_schedule_runs
set status = $3, error_message = $4, object_key = $5, ran_at = $6
where tenant_id = $1 and id = $2;

-- name: ListReportScheduleRuns :many
select * from report_schedule_runs
where tenant_id = $1 and schedule_id = $2
order by due_at desc
limit $3;
