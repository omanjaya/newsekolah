create table workflow_instances (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  definition_id uuid not null references workflow_definitions (id) on delete restrict,
  kind text not null check (kind in ('exit_permit', 'late_arrival', 'leave_request')),
  subject_user_id uuid not null references users (id) on delete cascade,
  class_id uuid references classes (id) on delete set null,
  current_stage_index int not null default 0 check (current_stage_index >= 0),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'approved', 'rejected', 'completed', 'cancelled', 'expired')),
  payload jsonb not null default '{}'::jsonb,
  -- Fixed-UTC generated column: partial unique indexes need an IMMUTABLE
  -- expression, and timestamptz::date depends on the session TimeZone GUC
  -- (STABLE, not IMMUTABLE). Pinning to UTC here is an approximation of
  -- "tenant calendar day" good enough for the one-in-progress-per-day
  -- guard; the expiry job (which does need the real tenant timezone)
  -- reads opened_at directly instead of this column.
  opened_date date generated always as ((opened_at at time zone 'utc')::date) stored,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ix_workflow_instances_tenant_id on workflow_instances (tenant_id, academic_year_id, kind);
create index ix_workflow_instances_subject on workflow_instances (subject_user_id, kind, status);
create index ix_workflow_instances_class on workflow_instances (class_id);
create index ix_workflow_instances_status on workflow_instances (tenant_id, status) where status = 'in_progress';

-- Bug fix vs. the old app (docs/analysis/backend-inventory.md 1.15): "max
-- one exit permit per day, none still unexited" is now a real constraint,
-- not a service-layer COUNT query racing another request. 'approved'
-- (every stage passed, gate token pending/issued but not yet scanned)
-- counts as "not yet exited" alongside 'in_progress'.
create unique index ux_workflow_instances_one_exit_permit_per_day
  on workflow_instances (tenant_id, subject_user_id, opened_date)
  where kind = 'exit_permit' and status in ('in_progress', 'approved');

alter table workflow_instances enable row level security;
alter table workflow_instances force row level security;

create policy tenant_isolation on workflow_instances
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_workflow_instances_set_updated_at
  before update on workflow_instances
  for each row execute function set_updated_at();

create table workflow_events (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  instance_id uuid not null references workflow_instances (id) on delete cascade,
  stage_key text,
  from_status text not null,
  to_status text not null,
  actor_user_id uuid references users (id) on delete set null,
  verification text not null check (verification in ('qr_scan', 'manual', 'auto')),
  scan_token_id uuid,
  note text check (length(note) <= 1000),
  occurred_at timestamptz not null default now()
);

create index ix_workflow_events_instance on workflow_events (instance_id, occurred_at);
create index ix_workflow_events_tenant_id on workflow_events (tenant_id);

alter table workflow_events enable row level security;
alter table workflow_events force row level security;

create policy tenant_isolation on workflow_events
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
