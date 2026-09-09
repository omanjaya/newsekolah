-- name: AcademicCreateYear :one
insert into academic_years (tenant_id, label, starts_on, ends_on, is_active)
values ($1, $2, $3, $4, false)
returning *;

-- name: AcademicUpdateYear :one
update academic_years
set label = $3, starts_on = $4, ends_on = $5, updated_at = now()
where tenant_id = $1 and id = $2 and archived_at is null
returning *;

-- name: AcademicGetYearByID :one
select * from academic_years where tenant_id = $1 and id = $2;

-- name: AcademicGetActiveYear :one
select * from academic_years where tenant_id = $1 and is_active limit 1;

-- name: AcademicListYears :many
select sqlc.embed(academic_years), count(*) over () as total_count
from academic_years
where tenant_id = $1
  and (sqlc.narg('search')::text is null or label ilike '%' || sqlc.narg('search') || '%')
  and (coalesce(sqlc.narg('include_archived'), false) or archived_at is null)
order by starts_on desc
limit $2 offset $3;

-- name: AcademicDeactivateAllYears :exec
update academic_years set is_active = false, updated_at = now() where tenant_id = $1 and is_active;

-- name: AcademicActivateYear :exec
update academic_years set is_active = true, updated_at = now() where tenant_id = $1 and id = $2;

-- name: AcademicArchiveYear :exec
update academic_years
set archived_at = now(), is_active = false, updated_at = now()
where tenant_id = $1 and id = $2;

-- name: AcademicCountClassesForYear :one
select count(*) from classes where tenant_id = $1 and academic_year_id = $2 and deleted_at is null;

-- name: AcademicCountEnrollmentsForYear :one
select count(*) from enrollments where tenant_id = $1 and academic_year_id = $2;
