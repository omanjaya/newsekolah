-- name: ListBillKeysForPeriod :many
-- Existing (fee_type_id, student_user_id) pairs already billed for one
-- period, used to keep a second generation run from even attempting a
-- duplicate insert (the unique index on bills is the backstop).
select fee_type_id, student_user_id from bills
where tenant_id = $1 and period = $2 and fee_type_id = any(sqlc.arg(fee_type_ids)::uuid[]);

-- name: CreateBill :one
-- Inserted one at a time inside the generation transaction (see
-- repository.CreateBills): "on conflict do nothing" makes each insert
-- idempotent on its own, and a plain loop keeps this query portable
-- across sqlc's static analysis instead of relying on a wide unnest.
-- Returns no row when the (fee_type_id, student_user_id, period) key
-- already exists, which the repository reads as "already billed, skip".
insert into bills (
  id, tenant_id, academic_year_id, student_user_id, fee_type_id, fee_type_name, currency, period, due_date,
  original_amount_minor, discount_amount_minor, amount_minor, status, generated_by
)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, sqlc.narg(generated_by))
on conflict (tenant_id, fee_type_id, student_user_id, period) do nothing
returning *;

-- name: ListBills :many
select b.* from bills b
left join enrollments e on e.student_user_id = b.student_user_id and e.academic_year_id = b.academic_year_id and e.status = 'active'
where b.tenant_id = $1 and b.academic_year_id = $2
  and (sqlc.narg(period)::text is null or b.period = sqlc.narg(period))
  and (sqlc.narg(status)::text is null or b.status = sqlc.narg(status))
  and (sqlc.narg(class_id)::uuid is null or e.class_id = sqlc.narg(class_id))
order by b.due_date desc, b.created_at desc
limit sqlc.arg(page_limit) offset sqlc.arg(page_offset);

-- name: GetBill :one
select * from bills where tenant_id = $1 and id = $2;

-- name: ListBillsForStudent :many
select * from bills where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3
order by due_date desc, created_at desc;

-- name: ListOutstandingBills :many
select * from bills where tenant_id = $1 and academic_year_id = $2 and status in ('unpaid', 'partial');

-- name: UpdateBillPayment :exec
update bills set paid_amount_minor = $3, status = $4 where tenant_id = $1 and id = $2;
