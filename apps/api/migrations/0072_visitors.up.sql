-- Widen document_templates(kind) so the visitors module can print a
-- numbered badge through the permits module's shared document pipeline
-- (see permits/domain.TemplateKindVisitorBadge) without a table of its own.
alter table document_templates drop constraint document_templates_kind_check;
alter table document_templates add constraint document_templates_kind_check check (kind in (
  'leave_letter', 'warning_letter', 'class_journal', 'member_card', 'item_label', 'clearance_letter', 'report', 'visitor_badge'
));

-- Visitors at the gate and incidents on campus (Fase 6, feature-flagged module "visitors").
-- Deliberately does not store a national identity number, an address, or a
-- photograph for a guest: the guard only needs enough to find the person
-- again and to say who let them in, not to build a file on them.
create table visitor_expected_guests (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  full_name text not null check (length(full_name) <= 160),
  organization text not null default '' check (length(organization) <= 160),
  host_user_id uuid not null references users (id),
  purpose text not null default '' check (length(purpose) <= 300),
  expected_date date not null,
  notes text not null default '' check (length(notes) <= 500),
  status text not null default 'pending' check (status in ('pending', 'arrived', 'expired', 'cancelled')),
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_visitor_expected_guests_tenant_id on visitor_expected_guests (tenant_id);
create index ix_visitor_expected_guests_date on visitor_expected_guests (tenant_id, expected_date);
alter table visitor_expected_guests enable row level security;
alter table visitor_expected_guests force row level security;
create policy tenant_isolation on visitor_expected_guests
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_visitor_expected_guests_set_updated_at before update on visitor_expected_guests
  for each row execute function set_updated_at();

create table visitor_visits (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  expected_guest_id uuid references visitor_expected_guests (id),
  full_name text not null check (length(full_name) <= 160),
  organization text not null default '' check (length(organization) <= 160),
  host_user_id uuid not null references users (id),
  purpose text not null default '' check (length(purpose) <= 300),
  -- Only that an identification document was sighted and its kind, never
  -- the document number or a photograph of it.
  id_checked boolean not null default false,
  id_type text not null default '' check (id_type in ('', 'ktp', 'sim', 'kartu_pelajar', 'kartu_pegawai', 'other')),
  badge_number text not null default '',
  badge_asset_id uuid references assets (id),
  arrived_at timestamptz not null default now(),
  departed_at timestamptz,
  checked_in_by uuid not null references users (id),
  checked_out_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_visitor_visits_tenant_id on visitor_visits (tenant_id);
create index ix_visitor_visits_on_campus on visitor_visits (tenant_id, departed_at) where departed_at is null;
create index ix_visitor_visits_arrived on visitor_visits (tenant_id, arrived_at desc);
alter table visitor_visits enable row level security;
alter table visitor_visits force row level security;
create policy tenant_isolation on visitor_visits
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_visitor_visits_set_updated_at before update on visitor_visits
  for each row execute function set_updated_at();

create table visitor_incidents (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  occurred_at timestamptz not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  description text not null check (length(description) <= 2000),
  persons_involved text not null default '' check (length(persons_involved) <= 1000),
  action_taken text not null default '' check (length(action_taken) <= 2000),
  reported_by uuid not null references users (id),
  is_closed boolean not null default false,
  closed_at timestamptz,
  closed_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_visitor_incidents_tenant_id on visitor_incidents (tenant_id);
create index ix_visitor_incidents_occurred on visitor_incidents (tenant_id, occurred_at desc);
alter table visitor_incidents enable row level security;
alter table visitor_incidents force row level security;
create policy tenant_isolation on visitor_incidents
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_visitor_incidents_set_updated_at before update on visitor_incidents
  for each row execute function set_updated_at();
