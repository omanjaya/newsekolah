-- name: CreateImpersonationSession :one
insert into sessions (
  tenant_id, user_id, kind, actor_user_id, refresh_token_hash, family_id, client, ip, user_agent, expires_at
) values (
  $1, $2, 'impersonation', $3, $4, $5, $6, $7, $8, $9
)
returning *;

-- name: InsertImpersonationAction :exec
insert into impersonation_actions (tenant_id, session_id, method, path)
values ($1, $2, $3, $4);
