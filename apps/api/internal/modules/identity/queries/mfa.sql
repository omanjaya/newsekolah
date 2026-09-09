-- name: GetMfaTotp :one
select * from mfa_totp where tenant_id = $1 and user_id = $2;

-- name: UpsertMfaTotp :one
insert into mfa_totp (user_id, tenant_id, secret_encrypted, recovery_codes_hash)
values ($1, $2, $3, $4)
on conflict (user_id) do update set secret_encrypted = excluded.secret_encrypted,
  recovery_codes_hash = excluded.recovery_codes_hash, confirmed_at = null
returning *;

-- name: ConfirmMfaTotp :one
update mfa_totp set confirmed_at = now() where tenant_id = $1 and user_id = $2
returning *;

-- name: SetMfaRecoveryCodes :exec
update mfa_totp set recovery_codes_hash = $3 where tenant_id = $1 and user_id = $2;

-- name: DeleteMfaTotp :exec
delete from mfa_totp where tenant_id = $1 and user_id = $2;
