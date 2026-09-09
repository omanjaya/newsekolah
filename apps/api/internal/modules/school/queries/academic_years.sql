-- name: CreateAcademicYear :one
insert into academic_years (tenant_id, label, starts_on, ends_on, is_active)
values ($1, $2, $3, $4, $5)
returning *;

-- name: GetActiveAcademicYear :one
select * from academic_years where tenant_id = $1 and is_active limit 1;

-- name: GetAcademicYearByID :one
select * from academic_years where tenant_id = $1 and id = $2;

-- name: DeactivateAllAcademicYears :exec
update academic_years set is_active = false, updated_at = now() where tenant_id = $1 and is_active;

-- name: ActivateAcademicYear :exec
update academic_years set is_active = true, updated_at = now() where tenant_id = $1 and id = $2;

-- name: ListAcademicYears :many
select * from academic_years where tenant_id = $1 order by starts_on desc;
