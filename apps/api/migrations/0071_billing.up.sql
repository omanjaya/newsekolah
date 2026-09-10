-- Billing module: fee types (SPP and one-off charges), per-student
-- discounts, generated bills, and payments recorded against them.
--
-- Every money column is a bigint counting the tenant's smallest currency
-- unit (amount_minor), never a float or numeric: for Indonesian rupiah,
-- which has no subunit in everyday use, one minor unit equals one
-- rupiah. currency is stored per fee type so a future tenant billing in
-- another currency is not assumed away.
--
-- The unique index on bills (tenant_id, fee_type_id, student_user_id,
-- period) is what makes generation idempotent at the database level: a
-- second generation run for the same period cannot insert a duplicate
-- bill even if application logic somehow tried.

create table fee_types (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  name text not null check (length(name) <= 150),
  description text not null default '' check (length(description) <= 2000),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'IDR' check (length(currency) = 3),
  recurrence text not null check (recurrence in ('monthly', 'one_off')),
  -- period is required for a one-off fee type (its bills always carry
  -- this fixed period) and left null for a monthly fee type, which takes
  -- its period from the generation request instead.
  period text check (
    (recurrence = 'one_off' and period is not null and length(period) <= 20) or
    (recurrence = 'monthly' and period is null)
  ),
  is_active boolean not null default true,
  created_by uuid references users (id) on delete set null,
  updated_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index ix_fee_types_tenant_id on fee_types (tenant_id, academic_year_id);
create unique index ux_fee_types_name on fee_types (academic_year_id, name) where deleted_at is null;

alter table fee_types enable row level security;
alter table fee_types force row level security;

create policy tenant_isolation on fee_types
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_fee_types_set_updated_at
  before update on fee_types
  for each row execute function set_updated_at();

create table fee_discounts (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  fee_type_id uuid not null references fee_types (id) on delete cascade,
  student_user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('percentage', 'fixed', 'waiver')),
  percentage_bp integer check (kind <> 'percentage' or (percentage_bp > 0 and percentage_bp <= 10000)),
  amount_minor bigint check (kind <> 'fixed' or amount_minor > 0),
  reason text not null check (length(reason) between 1 and 300),
  is_active boolean not null default true,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ix_fee_discounts_tenant_id on fee_discounts (tenant_id);
create index ix_fee_discounts_fee_type_id on fee_discounts (fee_type_id, student_user_id) where is_active;
create index ix_fee_discounts_student_id on fee_discounts (tenant_id, student_user_id);

alter table fee_discounts enable row level security;
alter table fee_discounts force row level security;

create policy tenant_isolation on fee_discounts
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_fee_discounts_set_updated_at
  before update on fee_discounts
  for each row execute function set_updated_at();

create table bills (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  student_user_id uuid not null references users (id) on delete cascade,
  fee_type_id uuid not null references fee_types (id) on delete restrict,
  -- fee_type_name and currency are snapshotted at generation time so
  -- editing or retiring a fee type later never rewrites an issued bill.
  fee_type_name text not null,
  currency text not null default 'IDR' check (length(currency) = 3),
  period text not null check (length(period) <= 20),
  due_date date not null,
  original_amount_minor bigint not null check (original_amount_minor >= 0),
  discount_amount_minor bigint not null default 0 check (discount_amount_minor >= 0),
  amount_minor bigint not null check (amount_minor >= 0),
  paid_amount_minor bigint not null default 0 check (paid_amount_minor >= 0 and paid_amount_minor <= amount_minor),
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
  generated_at timestamptz not null default now(),
  generated_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The idempotency guarantee: the same fee type can never bill the same
-- student twice for the same period.
create unique index ux_bills_key on bills (tenant_id, fee_type_id, student_user_id, period);
create index ix_bills_tenant_id on bills (tenant_id, academic_year_id);
create index ix_bills_student_id on bills (tenant_id, student_user_id);
create index ix_bills_status on bills (tenant_id, status) where status in ('unpaid', 'partial');

alter table bills enable row level security;
alter table bills force row level security;

create policy tenant_isolation on bills
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create trigger trg_bills_set_updated_at
  before update on bills
  for each row execute function set_updated_at();

create table payments (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  bill_id uuid not null references bills (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  method text not null check (method in ('cash', 'bank_transfer', 'other')),
  paid_on date not null,
  received_by uuid not null references users (id) on delete restrict,
  reference text not null default '' check (length(reference) <= 200),
  receipt_number text check (length(receipt_number) <= 80),
  receipt_asset_id uuid references assets (id) on delete restrict,
  created_at timestamptz not null default now(),
  -- A payment is never deleted; a correction voids it and keeps who did
  -- so and why (docs/04-clean-code.md: money mistakes correct forward,
  -- not by deleting the record).
  voided_at timestamptz,
  voided_by uuid references users (id) on delete set null,
  void_reason text check (voided_at is null or (void_reason is not null and length(void_reason) between 1 and 300))
);

create index ix_payments_tenant_id on payments (tenant_id);
create index ix_payments_bill_id on payments (bill_id);
create unique index ux_payments_receipt_number on payments (tenant_id, receipt_number) where receipt_number is not null;

alter table payments enable row level security;
alter table payments force row level security;

create policy tenant_isolation on payments
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
