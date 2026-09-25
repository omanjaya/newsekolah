-- name: PlatformGetOperatorAlertSettings :one
select * from operator_alert_settings where id = 1;

-- name: PlatformUpdateOperatorAlertSettings :one
update operator_alert_settings set
  enabled = $1,
  telegram_bot_token_encrypted = $2,
  telegram_bot_token_key_id = $3,
  telegram_chat_id = $4,
  check_health = $5,
  check_containers = $6,
  check_disk = $7,
  check_memory = $8,
  check_backup = $9,
  check_certificate = $10,
  check_errors_5xx = $11,
  disk_threshold_percent = $12,
  memory_threshold_mb = $13,
  backup_max_age_hours = $14,
  cert_expiry_days = $15,
  daily_summary_enabled = $16,
  daily_summary_hour = $17,
  updated_at = now(),
  updated_by = $18
where id = 1
returning *;
