-- name: CreatePasswordReset :one
insert into password_resets (tenant_id, user_id, token_hash, channel, expires_at)
values ($1, $2, $3, $4, $5)
returning *;

-- name: InvalidatePasswordResetsForUser :exec
-- Marks every still-unused password reset token for a user as used, so a
-- token issued (or confirmed) does not leave older tokens redeemable
-- alongside it (docs/08-security.md section 2).
update password_resets set used_at = now() where tenant_id = $1 and user_id = $2 and used_at is null;
