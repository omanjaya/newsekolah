-- Google Workspace SSO (docs/12-roadmap.md, Fase 5) and passkeys on the web.
--
-- sso_google_configs is a per-tenant, one-row-per-tenant configuration: a
-- tenant either has Google SSO configured or it does not, so tenant_id is
-- the primary key rather than a separate uuid with a unique constraint.
-- The client secret is only ever stored sealed by platform/crypto.Sealer;
-- nothing here can decrypt it.
create table sso_google_configs (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  client_id text not null check (length(client_id) between 1 and 255),
  client_secret_encrypted bytea not null,
  hosted_domain text not null check (length(hosted_domain) between 1 and 255),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table sso_google_configs enable row level security;
alter table sso_google_configs force row level security;

create policy tenant_isolation on sso_google_configs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_sso_google_configs_set_updated_at
  before update on sso_google_configs
  for each row execute function set_updated_at();

-- webauthn_credentials already exists (migrations/0002_identity.up.sql) with
-- the columns a hand-rolled protocol implementation would need. Passkeys
-- are implemented with github.com/go-webauthn/webauthn instead, whose
-- Credential carries a few fields that table has no column for yet
-- (AAGUID, attestation type, backup-eligible/backup-state flags); the
-- library's full Credential is kept as data so a future library upgrade
-- that adds fields does not need another migration, while the existing
-- columns stay populated for the credential list the security screen
-- reads without touching the JSON.
alter table webauthn_credentials
  add column data jsonb not null default '{}'::jsonb;
