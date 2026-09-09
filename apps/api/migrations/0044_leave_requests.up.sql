create table leave_requests (
  instance_id uuid primary key references workflow_instances (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  category text not null check (category in ('religious_ceremony', 'sick', 'dispensation', 'other')),
  reason text not null check (length(reason) <= 1000),
  starts_on date not null,
  ends_on date not null,
  letter_number text check (length(letter_number) <= 80),
  issued_at timestamptz,
  issued_by uuid references users (id) on delete set null,
  parent_approved_at timestamptz,
  student_name_snapshot text not null check (length(student_name_snapshot) <= 150),
  class_name_snapshot text not null check (length(class_name_snapshot) <= 100),
  guardian_name_snapshot text check (length(guardian_name_snapshot) <= 150),
  check (ends_on >= starts_on)
);

create index ix_leave_requests_tenant_id on leave_requests (tenant_id);
create unique index ux_leave_requests_letter_number on leave_requests (tenant_id, letter_number) where letter_number is not null;

alter table leave_requests enable row level security;
alter table leave_requests force row level security;

create policy tenant_isolation on leave_requests
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table leave_documents (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  leave_request_id uuid not null references leave_requests (instance_id) on delete cascade,
  kind text not null check (kind in ('evidence', 'letter')),
  asset_id uuid not null references assets (id) on delete restrict,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (leave_request_id, kind)
);

create index ix_leave_documents_tenant_id on leave_documents (tenant_id);

alter table leave_documents enable row level security;
alter table leave_documents force row level security;

create policy tenant_isolation on leave_documents
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
