-- name: ListDiscountsForFeeType :many
select * from fee_discounts where tenant_id = $1 and fee_type_id = $2 order by created_at desc;

-- name: ListDiscountsForStudent :many
select * from fee_discounts where tenant_id = $1 and student_user_id = $2 order by created_at desc;

-- name: ListActiveDiscounts :many
select * from fee_discounts
where tenant_id = $1 and is_active and fee_type_id = any(sqlc.arg(fee_type_ids)::uuid[]);

-- name: GetDiscount :one
select * from fee_discounts where tenant_id = $1 and id = $2;

-- name: CreateDiscount :one
insert into fee_discounts (tenant_id, fee_type_id, student_user_id, kind, percentage_bp, amount_minor, reason, created_by)
values ($1, $2, $3, $4, sqlc.narg(percentage_bp), sqlc.narg(amount_minor), $5, $6)
returning *;

-- name: UpdateDiscount :one
update fee_discounts set
  kind = $3, percentage_bp = sqlc.narg(percentage_bp), amount_minor = sqlc.narg(amount_minor), reason = $4, is_active = $5
where tenant_id = $1 and id = $2
returning *;

-- name: DeleteDiscount :exec
delete from fee_discounts where tenant_id = $1 and id = $2;
