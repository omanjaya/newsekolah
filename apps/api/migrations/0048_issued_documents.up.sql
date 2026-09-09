create table issued_documents (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  kind text not null,
  entity_type text not null check (length(entity_type) <= 100),
  entity_id uuid not null,
  number text not null check (length(number) <= 80),
  asset_id uuid references assets (id) on delete restrict,
  sha256 text not null,
  -- HMAC-SHA256(DOCUMENT_SIGNING_KEY, code) stored, never the plaintext
  -- verification code, matching how scan_tokens hashes its raw value.
  verification_code_hash bytea not null unique,
  issued_by uuid references users (id) on delete set null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index ix_issued_documents_tenant_id on issued_documents (tenant_id);
create index ix_issued_documents_entity on issued_documents (entity_type, entity_id);
create unique index ux_issued_documents_number on issued_documents (tenant_id, kind, number);

alter table issued_documents enable row level security;
alter table issued_documents force row level security;

create policy tenant_isolation on issued_documents
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
