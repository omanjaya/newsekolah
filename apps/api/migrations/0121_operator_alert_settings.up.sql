-- Operator alerts: platform-level (not tenant-scoped) settings the host
-- monitor script (infra/scripts/monitor.sh) reads to decide what to check
-- and where to send Telegram messages, configured from the platform
-- console instead of editing files on the server.
--
-- Modeled as a singleton row (id fixed to 1, enforced by the check
-- constraint) rather than a tenants-style multi-row table: there is
-- exactly one deployment to monitor, whether the install itself is
-- single-tenant or multi-tenant. The Telegram bot token is sealed with the
-- same crypto.Sealer counseling notes use (docs/08-security.md section 5)
-- -- never stored or returned in plaintext by any API response.
create table operator_alert_settings (
  id smallint primary key default 1 check (id = 1),

  enabled boolean not null default false,

  telegram_bot_token_encrypted bytea,
  telegram_bot_token_key_id text not null default '',
  telegram_chat_id text not null default '',

  check_health boolean not null default true,
  check_containers boolean not null default true,
  check_disk boolean not null default true,
  check_memory boolean not null default true,
  check_backup boolean not null default true,
  check_certificate boolean not null default true,
  check_errors_5xx boolean not null default true,

  disk_threshold_percent smallint not null default 85 check (disk_threshold_percent between 1 and 100),
  memory_threshold_mb integer not null default 512 check (memory_threshold_mb > 0),
  backup_max_age_hours integer not null default 30 check (backup_max_age_hours > 0),
  cert_expiry_days integer not null default 14 check (cert_expiry_days > 0),

  daily_summary_enabled boolean not null default false,
  daily_summary_hour smallint not null default 7 check (daily_summary_hour between 0 and 23),

  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into operator_alert_settings (id) values (1);

-- No tenant_isolation policy: this table has no tenant_id column, only
-- platform_access, matching platform_settings/tenant_settings's own
-- app.platform_admin gate (0001_platform_core.up.sql, database.WithPlatformTx).
alter table operator_alert_settings enable row level security;
alter table operator_alert_settings force row level security;

create policy platform_access on operator_alert_settings
  using (current_setting('app.platform_admin', true) = 'true')
  with check (current_setting('app.platform_admin', true) = 'true');
