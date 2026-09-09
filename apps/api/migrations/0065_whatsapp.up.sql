-- WhatsApp delivery (docs/12-roadmap.md Fase 5): per-tenant provider
-- selection (Meta Cloud API or a generic local gateway), named message
-- templates, and an extension of the message_deliveries log (0055) to
-- carry the template used, the rendered payload, and delivered/read
-- receipts from the inbound status webhook.

create table whatsapp_provider_configs (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  provider text not null default 'meta' check (provider in ('meta', 'gateway')),
  phone_number_id text not null default '',
  access_token_encrypted bytea,
  access_token_key_id text not null default '',
  gateway_url text not null default '',
  gateway_header_name text not null default '',
  gateway_header_value_encrypted bytea,
  gateway_header_key_id text not null default '',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Looked up by the inbound status webhook, which only knows the Meta
-- phone_number_id from the payload and has not resolved a tenant yet.
create unique index ux_whatsapp_provider_configs_phone_number_id
  on whatsapp_provider_configs (phone_number_id)
  where phone_number_id <> '';

alter table whatsapp_provider_configs enable row level security;
alter table whatsapp_provider_configs force row level security;

create policy tenant_isolation on whatsapp_provider_configs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- The webhook resolves tenant_id from phone_number_id before it can set
-- app.tenant_id, so it runs under the platform_admin escape hatch (same
-- pattern as tenant_exports in 0058) for that one lookup only.
create policy platform_access on whatsapp_provider_configs
  using (current_setting('app.platform_admin', true) = 'true')
  with check (current_setting('app.platform_admin', true) = 'true');

create table whatsapp_templates (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  locale text not null default 'id',
  meta_template_name text not null,
  body text not null,
  placeholders jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index ix_whatsapp_templates_tenant_id on whatsapp_templates (tenant_id);

alter table whatsapp_templates enable row level security;
alter table whatsapp_templates force row level security;

create policy tenant_isolation on whatsapp_templates
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table message_deliveries
  add column template_id uuid references whatsapp_templates (id) on delete set null,
  add column payload text not null default '',
  add column delivered_at timestamptz,
  add column read_at timestamptz;

alter table message_deliveries drop constraint message_deliveries_status_check;
alter table message_deliveries add constraint message_deliveries_status_check
  check (status in ('pending', 'sent', 'failed', 'delivered', 'read'));

create index ix_message_deliveries_provider_message_id
  on message_deliveries (tenant_id, provider_message_id)
  where provider_message_id is not null;
