-- name: CreateWebhookDelivery :one
insert into integration_webhook_deliveries (
  id, tenant_id, endpoint_id, event_type, event_id, payload, status, next_attempt_at
) values (
  $1, $2, $3, $4, $5, $6, $7, $8
)
returning *;

-- name: GetWebhookDeliveryByID :one
select * from integration_webhook_deliveries where tenant_id = $1 and id = $2;

-- name: ListWebhookDeliveries :many
select * from integration_webhook_deliveries
where tenant_id = $1
  and (sqlc.narg(endpoint_id)::uuid is null or endpoint_id = sqlc.narg(endpoint_id))
  and (not sqlc.arg(has_cursor)::boolean or (created_at, id) < (sqlc.arg(cursor_created_at)::timestamptz, sqlc.arg(cursor_id)::uuid))
order by created_at desc, id desc
limit sqlc.arg(page_limit);

-- name: UpdateWebhookDeliveryAttempt :exec
update integration_webhook_deliveries
set status = $3, attempt_count = $4, last_status_code = $5, last_error = $6,
    delivered_at = $7, next_attempt_at = $8
where tenant_id = $1 and id = $2;
