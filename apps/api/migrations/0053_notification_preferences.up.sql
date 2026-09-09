create table notification_preferences (
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null,
  kind text not null,
  channel text not null check (channel in ('inapp', 'push', 'whatsapp', 'email')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, channel)
);

create index ix_notification_preferences_tenant_id on notification_preferences (tenant_id);

alter table notification_preferences enable row level security;
alter table notification_preferences force row level security;

create policy tenant_isolation on notification_preferences
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Per-user settings beyond the (kind, channel) toggle grid: quiet hours (a
-- push/whatsapp send scheduled inside this window is deferred to its end)
-- and the daily email digest. Not in docs/06-database-schema.md section 10
-- verbatim, but owned entirely by this module (no other module reads or
-- writes it), so it extends the documented schema rather than replacing it.
create table notification_settings (
  user_id uuid primary key,
  tenant_id uuid not null references tenants (id) on delete cascade,
  quiet_hours_start smallint check (quiet_hours_start between 0 and 23),
  quiet_hours_end smallint check (quiet_hours_end between 0 and 23),
  digest_enabled boolean not null default false,
  digest_hour smallint not null default 7 check (digest_hour between 0 and 23),
  last_digest_at timestamptz,
  updated_at timestamptz not null default now()
);

create index ix_notification_settings_tenant_id on notification_settings (tenant_id);
create index ix_notification_settings_digest on notification_settings (digest_hour) where digest_enabled;

alter table notification_settings enable row level security;
alter table notification_settings force row level security;

create policy tenant_isolation on notification_settings
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
