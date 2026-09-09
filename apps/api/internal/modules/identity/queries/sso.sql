-- name: GetGoogleSSOConfig :one
select * from sso_google_configs where tenant_id = $1;

-- name: UpsertGoogleSSOConfig :one
insert into sso_google_configs (tenant_id, client_id, client_secret_encrypted, hosted_domain, enabled)
values ($1, $2, $3, $4, $5)
on conflict (tenant_id) do update set
  client_id = excluded.client_id,
  client_secret_encrypted = excluded.client_secret_encrypted,
  hosted_domain = excluded.hosted_domain,
  enabled = excluded.enabled
returning *;

-- name: DeleteGoogleSSOConfig :exec
delete from sso_google_configs where tenant_id = $1;
