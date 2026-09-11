-- name: CreateLoanRule :one
insert into library_loan_rules (tenant_id, member_type_id, starts_on, ends_on, allow_loans, max_loan_items, max_loan_days, notes, created_by)
values ($1, sqlc.narg(member_type_id)::uuid, $2, $3, $4, sqlc.narg(max_loan_items)::int, sqlc.narg(max_loan_days)::int, $5, sqlc.narg(created_by)::uuid)
returning *;

-- name: DeleteLoanRule :execrows
delete from library_loan_rules where tenant_id = $1 and id = $2;

-- name: ListLoanRulesActive :many
-- Every rule that has not fully expired yet, so the caller can resolve the
-- ones that cover today without another round trip per borrow check.
select * from library_loan_rules where tenant_id = $1 and ends_on >= $2 order by starts_on;
