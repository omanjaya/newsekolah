-- name: CreateViolation :one
insert into library_violations (tenant_id, loan_id, member_user_id, kind, penalty, amount, suspend_days, notes, created_by)
values ($1, sqlc.narg(loan_id)::uuid, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: GetViolation :one
select * from library_violations where tenant_id = $1 and id = $2;

-- name: ListViolationsForMember :many
select * from library_violations where tenant_id = $1 and member_user_id = $2 order by created_at desc;

-- name: ListViolations :many
select * from library_violations
where tenant_id = $1
  and (sqlc.narg(status)::text is null or status = sqlc.narg(status)::text)
  and (sqlc.narg(kind)::text is null or kind = sqlc.narg(kind)::text)
order by created_at desc
limit $2 offset $3;

-- name: SettleViolation :one
update library_violations set status = $3, settled_at = $4, settled_by = $5
where tenant_id = $1 and id = $2 and status = 'unpaid'
returning *;

-- name: HasUnpaidFine :one
select exists(
  select 1 from library_violations where tenant_id = $1 and member_user_id = $2 and status = 'unpaid' and penalty = 'fine'
)::bool;

-- name: CountUnpaidViolations :one
select count(*)::int from library_violations where tenant_id = $1 and member_user_id = $2 and status = 'unpaid';
