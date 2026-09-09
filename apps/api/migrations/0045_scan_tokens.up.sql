-- Generalized one-time QR/token primitive (docs/06-database-schema.md
-- section 7): "token yang sama dipakai untuk izin keluar dan terlambat"
-- and, eventually, classroom entry, library visits/opname and kiosk
-- check-in from modules built later. Bug fixes vs. the old app
-- (docs/analysis/backend-inventory.md 1.24, 08-security.md section 7):
-- the raw token is never stored (only its SHA-256 hash), consumption is a
-- single atomic UPDATE ... WHERE consumed_at IS NULL RETURNING, and
-- `purpose` is checked against the calling flow instead of one token
-- shape working for every endpoint.
create table scan_tokens (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  purpose text not null check (purpose in (
    'classroom_entry', 'late_arrival', 'approve_stage', 'gate_exit',
    'library_visit', 'library_self_service', 'library_opname', 'kiosk'
  )),
  context_id uuid,
  issued_by_user_id uuid not null references users (id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index ix_scan_tokens_tenant_id on scan_tokens (tenant_id);
create index ix_scan_tokens_pending on scan_tokens (tenant_id, purpose, expires_at) where consumed_at is null;
create index ix_scan_tokens_context on scan_tokens (context_id) where context_id is not null;

alter table scan_tokens enable row level security;
alter table scan_tokens force row level security;

create policy tenant_isolation on scan_tokens
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Retroactive FKs now that scan_tokens exists, same pattern as
-- migrations/0003_academic.up.sql wiring duty_assignments.scope_class_id
-- back to classes once classes exists.
alter table workflow_events
  add constraint fk_workflow_events_scan_token foreign key (scan_token_id) references scan_tokens (id) on delete set null;

alter table exit_permits
  add constraint fk_exit_permits_gate_token foreign key (gate_token_id) references scan_tokens (id) on delete set null;
