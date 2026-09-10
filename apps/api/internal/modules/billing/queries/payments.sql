-- name: CreatePayment :one
insert into payments (id, tenant_id, bill_id, amount_minor, method, paid_on, received_by, reference)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: GetPayment :one
select * from payments where tenant_id = $1 and id = $2;

-- name: ListPaymentsForBill :many
select * from payments where tenant_id = $1 and bill_id = $2 order by created_at;

-- name: VoidPayment :one
update payments set voided_at = now(), voided_by = $3, void_reason = $4
where tenant_id = $1 and id = $2 and voided_at is null
returning *;

-- name: SetPaymentReceipt :exec
update payments set receipt_number = $3, receipt_asset_id = $4 where tenant_id = $1 and id = $2;
