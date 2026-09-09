-- name: CreateWebhookEndpoint :one
insert into integration_webhook_endpoints (
  id, tenant_id, url, description, event_types, signing_secret_ciphertext, created_by
) values (
  $1, $2, $3, $4, $5, $6, $7
)
returning *;

-- name: GetWebhookEndpointByID :one
select * from integration_webhook_endpoints where tenant_id = $1 and id = $2;

-- name: ListWebhookEndpoints :many
select * from integration_webhook_endpoints where tenant_id = $1 order by created_at desc;

-- name: ListActiveWebhookEndpointsForEvent :many
select * from integration_webhook_endpoints
where tenant_id = $1 and status = 'active' and event_types @> array[sqlc.arg(event_type)::text]
order by created_at;

-- name: UpdateWebhookEndpoint :one
update integration_webhook_endpoints
set url = $3, description = $4, event_types = $5
where tenant_id = $1 and id = $2
returning *;

-- name: DeleteWebhookEndpoint :exec
delete from integration_webhook_endpoints where tenant_id = $1 and id = $2;

-- name: DisableWebhookEndpoint :exec
update integration_webhook_endpoints
set status = 'disabled', disabled_reason = $3
where tenant_id = $1 and id = $2;

-- name: IncrementWebhookEndpointFailure :one
update integration_webhook_endpoints
set consecutive_failures = consecutive_failures + 1
where tenant_id = $1 and id = $2
returning consecutive_failures;

-- name: ResetWebhookEndpointFailure :exec
update integration_webhook_endpoints set consecutive_failures = 0
where tenant_id = $1 and id = $2 and consecutive_failures <> 0;
