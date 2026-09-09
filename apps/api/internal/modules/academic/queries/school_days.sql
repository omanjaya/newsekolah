-- name: AcademicUpsertSchoolDay :exec
insert into school_days (tenant_id, academic_year_id, day_of_week, is_active)
values ($1, $2, $3, $4)
on conflict (academic_year_id, day_of_week) do update set is_active = excluded.is_active;

-- name: AcademicListSchoolDays :many
select * from school_days where tenant_id = $1 and academic_year_id = $2 order by day_of_week;
