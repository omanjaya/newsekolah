-- Library violations (old app's library_violations): a record of what a
-- loan cost a member beyond the copy itself -- late, lost, damaged, or a
-- manually recorded issue -- and how it was settled. The rebuild's first
-- pass only kept a bare fine_amount/fine_paid_at pair on library_loans
-- (see repository/loans.go MarkLoanFinePaid, never called from any
-- service); this table replaces that with the entity the old app had:
-- listable, manually recordable, and settleable as paid or waived.
create table library_violations (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  loan_id uuid references library_loans (id) on delete set null,
  member_user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('late', 'lost', 'damaged', 'other')),
  penalty text not null check (penalty in ('fine', 'suspend', 'warning', 'replace_book')),
  amount int not null default 0 check (amount >= 0),
  suspend_days int not null default 0 check (suspend_days >= 0),
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'waived')),
  notes text not null default '' check (length(notes) <= 500),
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  settled_by uuid references users (id)
);
create index ix_library_violations_tenant_id on library_violations (tenant_id);
create index ix_library_violations_member on library_violations (tenant_id, member_user_id, status);
create index ix_library_violations_loan on library_violations (loan_id) where loan_id is not null;
alter table library_violations enable row level security;
alter table library_violations force row level security;
create policy tenant_isolation on library_violations
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
