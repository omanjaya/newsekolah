-- name: CreateAPIKey :one
insert into integration_api_keys (
  id, tenant_id, name, secret_hash, permissions, created_by, ip_allowlist,
  rate_limit_per_minute, expires_at
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9
)
returning *;

-- name: GetAPIKeyByID :one
select * from integration_api_keys where tenant_id = $1 and id = $2;

-- name: ListAPIKeys :many
select * from integration_api_keys where tenant_id = $1 order by created_at desc;

-- name: RevokeAPIKey :one
update integration_api_keys set revoked_at = $3
where tenant_id = $1 and id = $2 and revoked_at is null
returning *;

-- name: TouchAPIKeyLastUsed :exec
update integration_api_keys set last_used_at = $3 where tenant_id = $1 and id = $2;
