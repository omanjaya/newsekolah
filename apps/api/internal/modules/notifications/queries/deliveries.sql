-- name: InsertMessageDelivery :one
insert into message_deliveries (tenant_id, notification_id, notification_created_at, channel, provider, target, status)
values ($1, $2, $3, $4, $5, $6, 'pending')
returning *;

-- name: RecordDeliveryAttempt :exec
update message_deliveries
set status = $3, provider_message_id = $4, error = $5, attempts = attempts + 1,
    sent_at = case when $3 = 'sent' then now() else sent_at end
where tenant_id = $1 and id = $2;

-- name: DeleteDeliveriesOlderThan :execrows
delete from message_deliveries where tenant_id = $1 and created_at < $2;
