-- name: CreateSession :one
insert into sessions (tenant_id, user_id, kind, refresh_token_hash, family_id, client, device_id, device_name, user_agent, ip, expires_at)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
returning *;

-- name: GetSessionByID :one
select * from sessions where tenant_id = $1 and id = $2;

-- name: GetSessionByRefreshHash :one
select * from sessions where tenant_id = $1 and refresh_token_hash = $2;

-- name: RevokeSession :exec
update sessions set revoked_at = now(), revoked_reason = $3 where tenant_id = $1 and id = $2 and revoked_at is null;

-- name: RevokeSessionFamily :exec
update sessions set revoked_at = now(), revoked_reason = $3 where tenant_id = $1 and family_id = $2 and revoked_at is null;

-- name: RevokeOtherUserSessions :exec
update sessions
set revoked_at = now(), revoked_reason = $4
where tenant_id = $1 and user_id = $2 and id != $3 and revoked_at is null;

-- name: ListActiveSessionsForUser :many
select * from sessions
where tenant_id = $1 and user_id = $2 and revoked_at is null and expires_at > now()
order by last_seen_at desc;

-- name: TouchSessionLastSeen :exec
update sessions set last_seen_at = now() where tenant_id = $1 and id = $2;

-- name: InsertLoginAttempt :exec
insert into login_attempts (tenant_id, username, ip, success)
values ($1, $2, $3, $4);
