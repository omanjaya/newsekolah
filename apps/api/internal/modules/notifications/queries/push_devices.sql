-- name: UpsertPushDevice :one
insert into push_devices (tenant_id, user_id, platform, token_or_endpoint, endpoint_hash, p256dh, auth_key, device_name, expires_at)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
on conflict (endpoint_hash) do update set
  user_id = excluded.user_id,
  platform = excluded.platform,
  token_or_endpoint = excluded.token_or_endpoint,
  p256dh = excluded.p256dh,
  auth_key = excluded.auth_key,
  device_name = excluded.device_name,
  expires_at = excluded.expires_at,
  failure_count = 0
returning *;

-- name: DeletePushDeviceByEndpointHash :exec
delete from push_devices where tenant_id = $1 and user_id = $2 and endpoint_hash = $3;

-- name: DeletePushDeviceByID :exec
delete from push_devices where tenant_id = $1 and id = $2;

-- name: GetPushDeviceByID :one
select * from push_devices where tenant_id = $1 and id = $2;

-- name: ListPushDevicesForUser :many
select * from push_devices where tenant_id = $1 and user_id = $2 order by created_at desc;

-- name: ListPushDevicesForUsers :many
select * from push_devices where tenant_id = $1 and user_id = any(sqlc.arg(user_ids)::uuid[]);

-- name: TouchPushDeviceUsed :exec
update push_devices set last_used_at = $3, failure_count = 0 where tenant_id = $1 and id = $2;

-- name: IncrementPushDeviceFailure :exec
update push_devices set failure_count = failure_count + 1 where tenant_id = $1 and id = $2;

-- name: DeleteExpiredOrFailedPushDevices :execrows
delete from push_devices
where tenant_id = sqlc.arg(tenant_id)::uuid
  and (expires_at < now() or failure_count >= sqlc.arg(max_failures)::int);
