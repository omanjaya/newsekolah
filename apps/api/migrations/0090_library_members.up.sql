-- Library members: the old app's member profile (member_no, type, validity,
-- status, suspension, notes) that the rebuild's first pass dropped in favor
-- of a bare users.id (docs/06-database-schema.md:246-248 already plans
-- library_member_types and library_members). user_id stays the primary key
-- per that plan note ("library_members.user_id tetap PK").
create table library_member_types (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null check (length(name) <= 100),
  max_loan_items int not null default 3 check (max_loan_items > 0),
  max_loan_days int not null default 7 check (max_loan_days > 0),
  renewal_days int not null default 7 check (renewal_days > 0),
  max_renewals int not null default 1 check (max_renewals >= 0),
  fine_type text not null default 'constant' check (fine_type in ('constant', 'per_tenor')),
  fine_per_tenor int not null default 1000 check (fine_per_tenor >= 0),
  tenor_days int not null default 1 check (tenor_days > 0),
  suspend_days int not null default 0 check (suspend_days >= 0),
  validity_months int not null default 12 check (validity_months > 0),
  default_for_role text check (default_for_role in ('student', 'teacher', 'staff', 'parent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index ix_library_member_types_tenant_id on library_member_types (tenant_id);
-- One default type per role at most, so auto-registration never has to
-- pick among ties.
create unique index ux_library_member_types_default_role on library_member_types (tenant_id, default_for_role)
  where default_for_role is not null and deleted_at is null;
alter table library_member_types enable row level security;
alter table library_member_types force row level security;
create policy tenant_isolation on library_member_types
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_library_member_types_set_updated_at before update on library_member_types
  for each row execute function set_updated_at();

create table library_members (
  user_id uuid primary key references users (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  member_no text not null check (length(member_no) <= 40),
  member_type_id uuid not null references library_member_types (id) on delete restrict,
  registered_on date not null,
  valid_until date,
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive', 'suspended', 'cleared')),
  suspended_until date,
  late_return_count int not null default 0 check (late_return_count >= 0),
  notes text not null default '' check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, member_no)
);
create index ix_library_members_tenant_id on library_members (tenant_id);
create index ix_library_members_type on library_members (tenant_id, member_type_id);
create index ix_library_members_status on library_members (tenant_id, status);
alter table library_members enable row level security;
alter table library_members force row level security;
create policy tenant_isolation on library_members
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
create trigger trg_library_members_set_updated_at before update on library_members
  for each row execute function set_updated_at();

-- Dated policy overrides (old app's library_loan_rules): a row with
-- member_type_id null applies to every type; allow_loans=false closes
-- lending tenant-wide (or for one type) for the date range, e.g. during
-- a stocktake week.
create table library_loan_rules (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  member_type_id uuid references library_member_types (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  allow_loans boolean not null default true,
  max_loan_items int check (max_loan_items > 0),
  max_loan_days int check (max_loan_days > 0),
  notes text not null default '' check (length(notes) <= 300),
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index ix_library_loan_rules_tenant_id on library_loan_rules (tenant_id);
create index ix_library_loan_rules_range on library_loan_rules (tenant_id, starts_on, ends_on);
alter table library_loan_rules enable row level security;
alter table library_loan_rules force row level security;
create policy tenant_isolation on library_loan_rules
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
