create table message_deliveries (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  notification_id uuid not null,
  notification_created_at timestamptz not null,
  channel text not null check (channel in ('inapp', 'push', 'whatsapp', 'email')),
  provider text not null,
  target text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  error text,
  attempts integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (notification_id, notification_created_at) references notifications (id, created_at) on delete cascade
);

create index ix_message_deliveries_tenant_id on message_deliveries (tenant_id);
create index ix_message_deliveries_notification_id on message_deliveries (notification_id);
create index ix_message_deliveries_created_at on message_deliveries (created_at);

alter table message_deliveries enable row level security;
alter table message_deliveries force row level security;

create policy tenant_isolation on message_deliveries
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
