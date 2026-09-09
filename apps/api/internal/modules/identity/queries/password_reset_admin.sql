-- name: GetUserByUsernameOrEmail :one
select * from users
where tenant_id = $1 and deleted_at is null and (username = $2 or email = $2)
limit 1;

-- name: GetValidPasswordResetByHash :one
select * from password_resets
where tenant_id = $1 and token_hash = $2 and used_at is null and expires_at > now();

-- name: MarkPasswordResetUsed :exec
update password_resets set used_at = now() where tenant_id = $1 and id = $2;
