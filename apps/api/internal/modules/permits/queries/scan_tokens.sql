-- name: CreateScanToken :one
insert into scan_tokens (tenant_id, purpose, context_id, issued_by_user_id, token_hash, expires_at)
values ($1, $2, $3, $4, $5, $6)
returning *;

-- name: ConsumeScanToken :one
-- Bug fix vs. the old app (docs/08-security.md section 7): single atomic
-- UPDATE guarded by consumed_at IS NULL AND expires_at > now(), so two
-- concurrent scans of the same token can never both succeed.
update scan_tokens
set consumed_at = $4, consumed_by_user_id = $3
where tenant_id = $1 and token_hash = $2 and consumed_at is null and expires_at > $4
returning *;

-- name: GetScanTokenByHash :one
select * from scan_tokens where tenant_id = $1 and token_hash = $2;

-- name: DeleteExpiredScanTokens :execrows
delete from scan_tokens where tenant_id = $1 and expires_at < $2;
