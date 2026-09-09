-- name: AcademicUpsertWeekdayAssignment :exec
insert into period_day_assignments (tenant_id, academic_year_id, day_of_week, template_id)
values ($1, $2, $3, $4)
on conflict (academic_year_id, day_of_week) do update set template_id = excluded.template_id;

-- name: AcademicListWeekdayAssignments :many
select * from period_day_assignments where tenant_id = $1 and academic_year_id = $2 order by day_of_week;

-- name: AcademicGetWeekdayAssignment :one
select * from period_day_assignments
where tenant_id = $1 and academic_year_id = $2 and day_of_week = $3;
