-- Configurable workflow engine (docs/06-database-schema.md section 7):
-- one versioned, ordered stage list per tenant per kind. Default
-- definitions matching the old SION behaviour are seeded by
-- modules/permits/service.EnsureDefaultDefinitions the first time a
-- tenant needs one, not by this migration -- a fresh tenant with no
-- workflow_definitions row yet is a valid, expected state.
create table workflow_definitions (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  kind text not null check (kind in ('exit_permit', 'late_arrival', 'leave_request')),
  version int not null check (version > 0),
  is_active boolean not null default true,
  -- stages: ordered array of
  --   {key, label, approver_rule, verification, distinct_from: [stage_key...], lookahead_slots?}
  stages jsonb not null,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, kind, version)
);

create index ix_workflow_definitions_tenant_id on workflow_definitions (tenant_id, kind);

-- Only one active version per kind drives new instances; older versions
-- stay around so in-flight instances keep referencing the definition they
-- started under (definition_id is fixed at instance creation time).
create unique index ux_workflow_definitions_active on workflow_definitions (tenant_id, kind) where is_active;

alter table workflow_definitions enable row level security;
alter table workflow_definitions force row level security;

create policy tenant_isolation on workflow_definitions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
