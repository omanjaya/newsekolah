-- Library module: catalogue, copies, loans, reservations, stocktake.
--
-- The circulation policy (loan days, active loan limit, renewal limit and
-- days, fine per day, reservation hold days) is stored in library_policies
-- rather than tenant_policies: tenant_policies.kind has a CHECK constraint
-- that only allows attendance_statuses, discipline_levels,
-- late_arrival_actions, grading, calendar, permits and document_numbering,
-- and this migration does not touch other modules' constraint. The shape
-- mirrors tenant_policies (versioned, one row per version) so it can be
-- folded into that table later if the constraint is ever widened.
create table library_policies (
  tenant_id uuid not null references tenants (id) on delete cascade,
  version int not null check (version > 0),
  config jsonb not null,
  effective_from date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (tenant_id, version)
);
alter table library_policies enable row level security;
alter table library_policies force row level security;
create policy tenant_isolation on library_policies
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table library_titles (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  title text not null check (length(title) <= 300),
  subtitle text not null default '' check (length(subtitle) <= 300),
  author text not null default '' check (length(author) <= 200),
  publisher text not null default '' check (length(publisher) <= 200),
  publish_year int check (publish_year is null or (publish_year between 1000 and 3000)),
  isbn text not null default '' check (length(isbn) <= 32),
  classification text not null default '' check (length(classification) <= 60),
  language text not null default 'ind' check (length(language) <= 10),
  cover_asset_id uuid references assets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index ix_library_titles_tenant_id on library_titles (tenant_id);
create index ix_library_titles_search on library_titles (tenant_id, lower(title));
create index ix_library_titles_isbn on library_titles (tenant_id, isbn) where isbn <> '';
alter table library_titles enable row level security;
alter table library_titles force row level security;
create policy tenant_isolation on library_titles
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_library_titles_set_updated_at before update on library_titles
  for each row execute function set_updated_at();

create table library_copies (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  title_id uuid not null references library_titles (id) on delete cascade,
  barcode text not null check (length(barcode) <= 64),
  condition text not null default 'good' check (condition in ('good', 'fair', 'damaged', 'lost')),
  status text not null default 'available' check (status in ('available', 'on_loan', 'reserved', 'withdrawn')),
  acquired_on date,
  notes text not null default '' check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, barcode)
);
create index ix_library_copies_tenant_id on library_copies (tenant_id);
create index ix_library_copies_title on library_copies (title_id, status);
alter table library_copies enable row level security;
alter table library_copies force row level security;
create policy tenant_isolation on library_copies
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_library_copies_set_updated_at before update on library_copies
  for each row execute function set_updated_at();

create table library_loans (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  copy_id uuid not null references library_copies (id) on delete cascade,
  title_id uuid not null references library_titles (id) on delete cascade,
  member_user_id uuid not null references users (id) on delete cascade,
  checked_out_by uuid not null references users (id),
  borrowed_at timestamptz not null,
  due_on date not null,
  returned_at timestamptz,
  checked_in_by uuid references users (id),
  renewal_count int not null default 0 check (renewal_count >= 0),
  status text not null default 'active' check (status in ('active', 'returned', 'lost')),
  fine_amount int not null default 0 check (fine_amount >= 0),
  fine_paid_at timestamptz,
  -- a copy already on loan cannot be borrowed again: only one active loan
  -- per copy can exist at a time.
  active_copy_id uuid generated always as (case when status = 'active' then copy_id else null end) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (active_copy_id)
);
create index ix_library_loans_tenant_id on library_loans (tenant_id);
create index ix_library_loans_member on library_loans (member_user_id, status, due_on);
create index ix_library_loans_due on library_loans (tenant_id, status, due_on);
alter table library_loans enable row level security;
alter table library_loans force row level security;
create policy tenant_isolation on library_loans
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_library_loans_set_updated_at before update on library_loans
  for each row execute function set_updated_at();

create table library_reservations (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  title_id uuid not null references library_titles (id) on delete cascade,
  member_user_id uuid not null references users (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'ready', 'fulfilled', 'cancelled', 'expired')),
  requested_at timestamptz not null,
  ready_at timestamptz,
  expires_at timestamptz,
  fulfilled_loan_id uuid references library_loans (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_library_reservations_tenant_id on library_reservations (tenant_id);
create index ix_library_reservations_title on library_reservations (title_id, status, requested_at);
create index ix_library_reservations_member on library_reservations (member_user_id, status);
alter table library_reservations enable row level security;
alter table library_reservations force row level security;
create policy tenant_isolation on library_reservations
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_library_reservations_set_updated_at before update on library_reservations
  for each row execute function set_updated_at();

create table library_stocktakes (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null check (length(name) <= 160),
  started_on date not null,
  ended_on date,
  coordinator_user_id uuid not null references users (id),
  status text not null default 'open' check (status in ('open', 'closed')),
  notes text not null default '' check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_library_stocktakes_tenant_id on library_stocktakes (tenant_id);
alter table library_stocktakes enable row level security;
alter table library_stocktakes force row level security;
create policy tenant_isolation on library_stocktakes
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_library_stocktakes_set_updated_at before update on library_stocktakes
  for each row execute function set_updated_at();

create table library_stocktake_scans (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  stocktake_id uuid not null references library_stocktakes (id) on delete cascade,
  copy_id uuid not null references library_copies (id) on delete cascade,
  barcode text not null check (length(barcode) <= 64),
  scanned_at timestamptz not null,
  scanned_by_user_id uuid not null references users (id),
  created_at timestamptz not null default now(),
  unique (stocktake_id, copy_id)
);
create index ix_library_stocktake_scans_tenant_id on library_stocktake_scans (tenant_id);
create index ix_library_stocktake_scans_stocktake on library_stocktake_scans (stocktake_id);
alter table library_stocktake_scans enable row level security;
alter table library_stocktake_scans force row level security;
create policy tenant_isolation on library_stocktake_scans
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
