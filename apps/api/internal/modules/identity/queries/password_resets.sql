-- name: CreatePasswordReset :one
insert into password_resets (tenant_id, user_id, token_hash, channel, expires_at)
values ($1, $2, $3, $4, $5)
returning *;
