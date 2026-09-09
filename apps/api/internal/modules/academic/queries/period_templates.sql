-- name: AcademicCreatePeriodTemplate :one
insert into period_templates (tenant_id, name, is_default)
values ($1, $2, $3)
returning *;

-- name: AcademicUpdatePeriodTemplate :one
update period_templates set name = $3, is_default = $4, updated_at = now()
where tenant_id = $1 and id = $2
returning *;

-- name: AcademicGetPeriodTemplateByID :one
select * from period_templates where tenant_id = $1 and id = $2;

-- name: AcademicGetDefaultPeriodTemplate :one
select * from period_templates where tenant_id = $1 and is_default limit 1;

-- name: AcademicListPeriodTemplates :many
select * from period_templates where tenant_id = $1 order by name;

-- name: AcademicDeletePeriodTemplate :exec
delete from period_templates where tenant_id = $1 and id = $2;

-- name: AcademicClearDefaultPeriodTemplate :exec
update period_templates set is_default = false, updated_at = now() where tenant_id = $1 and is_default;

-- name: AcademicCountWeekdayAssignmentsForTemplate :one
select count(*) from period_day_assignments where tenant_id = $1 and template_id = $2;

-- name: AcademicCreatePeriod :one
insert into periods (tenant_id, template_id, name, sequence, starts_at, ends_at, is_break)
values ($1, $2, $3, $4, $5, $6, $7)
returning *;

-- name: AcademicUpdatePeriod :one
update periods set name = $3, sequence = $4, starts_at = $5, ends_at = $6, is_break = $7
where tenant_id = $1 and id = $2
returning *;

-- name: AcademicGetPeriodByID :one
select * from periods where tenant_id = $1 and id = $2;

-- name: AcademicListPeriodsByTemplate :many
select * from periods where tenant_id = $1 and template_id = $2 order by sequence;

-- name: AcademicDeletePeriod :exec
delete from periods where tenant_id = $1 and id = $2;
