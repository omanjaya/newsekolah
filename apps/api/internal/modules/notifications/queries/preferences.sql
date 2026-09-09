-- name: UpsertNotificationPreference :exec
insert into notification_preferences (tenant_id, user_id, kind, channel, enabled)
values ($1, $2, $3, $4, $5)
on conflict (user_id, kind, channel) do update set enabled = excluded.enabled, updated_at = now();

-- name: ListNotificationPreferencesForUser :many
select * from notification_preferences where tenant_id = $1 and user_id = $2;

-- name: GetNotificationSettings :one
select * from notification_settings where tenant_id = $1 and user_id = $2;

-- name: UpsertNotificationSettings :one
insert into notification_settings (tenant_id, user_id, quiet_hours_start, quiet_hours_end, digest_enabled, digest_hour)
values ($1, $2, $3, $4, $5, $6)
on conflict (user_id) do update set
  quiet_hours_start = excluded.quiet_hours_start,
  quiet_hours_end = excluded.quiet_hours_end,
  digest_enabled = excluded.digest_enabled,
  digest_hour = excluded.digest_hour,
  updated_at = now()
returning *;

-- name: ListUsersDueForDigest :many
-- Drives the hourly digest periodic job: every user whose configured
-- digest hour is the current tenant-local hour.
select * from notification_settings
where tenant_id = $1 and digest_enabled and digest_hour = $2;

-- name: MarkDigestSent :exec
update notification_settings set last_digest_at = $3 where tenant_id = $1 and user_id = $2;
