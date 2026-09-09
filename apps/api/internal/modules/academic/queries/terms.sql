-- name: AcademicCreateTerm :one
insert into terms (tenant_id, academic_year_id, name, sequence, starts_on, ends_on, is_active)
values ($1, $2, $3, $4, $5, $6, false)
returning *;

-- name: AcademicUpdateTerm :one
update terms
set name = $3, starts_on = $4, ends_on = $5
where tenant_id = $1 and id = $2
returning *;

-- name: AcademicGetTermByID :one
select * from terms where tenant_id = $1 and id = $2;

-- name: AcademicListTermsByYear :many
select * from terms where tenant_id = $1 and academic_year_id = $2 order by sequence;

-- name: AcademicDeleteTerm :exec
delete from terms where tenant_id = $1 and id = $2;

-- name: AcademicDeactivateAllTermsForYear :exec
update terms set is_active = false where tenant_id = $1 and academic_year_id = $2 and is_active;

-- name: AcademicActivateTerm :exec
update terms set is_active = true where tenant_id = $1 and id = $2;
