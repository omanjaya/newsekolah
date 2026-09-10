-- name: ListFeeTypes :many
select * from fee_types
where tenant_id = $1 and academic_year_id = $2 and deleted_at is null and (sqlc.arg(include_inactive)::bool or is_active)
order by name;

-- name: ListActiveFeeTypes :many
select * from fee_types
where tenant_id = $1 and academic_year_id = $2 and deleted_at is null and is_active
order by name;

-- name: GetFeeType :one
select * from fee_types where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: CreateFeeType :one
insert into fee_types (tenant_id, academic_year_id, name, description, amount_minor, currency, recurrence, period, created_by, updated_by)
values ($1, $2, $3, $4, $5, $6, $7, sqlc.narg(period), $8, $9)
returning *;

-- name: UpdateFeeType :one
update fee_types set
  name = $3, description = $4, amount_minor = $5, currency = $6, recurrence = $7, period = sqlc.narg(period),
  is_active = $8, updated_by = $9
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;

-- name: DeleteFeeType :exec
update fee_types set deleted_at = now(), is_active = false where tenant_id = $1 and id = $2 and deleted_at is null;
