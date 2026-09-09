-- One row per exit-permit workflow instance; instance_id is both the PK
-- and the FK, matching docs/06-database-schema.md section 7
-- (exit_permits(instance_id primary key, ...)).
create table exit_permits (
  instance_id uuid primary key references workflow_instances (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  destination text not null check (length(destination) <= 500),
  start_period_id uuid not null references periods (id) on delete restrict,
  end_period_id uuid not null references periods (id) on delete restrict,
  issued_at timestamptz,
  gate_token_id uuid,
  exited_at timestamptz,
  security_user_id uuid references users (id) on delete set null,
  student_name_snapshot text not null check (length(student_name_snapshot) <= 150),
  class_name_snapshot text not null check (length(class_name_snapshot) <= 100)
);

create index ix_exit_permits_tenant_id on exit_permits (tenant_id);
create index ix_exit_permits_gate_token_id on exit_permits (gate_token_id);

alter table exit_permits enable row level security;
alter table exit_permits force row level security;

create policy tenant_isolation on exit_permits
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
