-- Records the circulation module's first pass dropped: which desk a loan
-- came through, a per-copy event trail, and renewal history (old app kept
-- only a renewal_count). Also opens the OPAC visibility flag the catalogue
-- module's migration may or may not have added yet -- guarded with
-- `if not exists` so whichever of the two parallel migrations lands first
-- is a no-op for the other (see docs/06-database-schema.md:246-248).
alter table library_loans
  add column channel text not null default 'desk' check (channel in ('desk', 'self_service', 'mobile'));

create table library_item_events (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  copy_id uuid not null references library_copies (id) on delete cascade,
  loan_id uuid references library_loans (id) on delete set null,
  member_user_id uuid references users (id) on delete set null,
  event_type text not null check (event_type in ('borrowed', 'returned', 'renewed', 'lost', 'damaged', 'reserved', 'stocktake')),
  notes text not null default '' check (length(notes) <= 300),
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);
create index ix_library_item_events_tenant_id on library_item_events (tenant_id);
create index ix_library_item_events_copy on library_item_events (tenant_id, copy_id, created_at desc);
alter table library_item_events enable row level security;
alter table library_item_events force row level security;
create policy tenant_isolation on library_item_events
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table library_loan_renewals (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  loan_id uuid not null references library_loans (id) on delete cascade,
  renewed_at timestamptz not null,
  previous_due_on date not null,
  new_due_on date not null,
  renewed_by uuid not null references users (id)
);
create index ix_library_loan_renewals_tenant_id on library_loan_renewals (tenant_id);
create index ix_library_loan_renewals_loan on library_loan_renewals (tenant_id, loan_id);
alter table library_loan_renewals enable row level security;
alter table library_loan_renewals force row level security;
create policy tenant_isolation on library_loan_renewals
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table library_titles add column if not exists is_opac boolean not null default true;
alter table library_copies add column if not exists is_opac boolean not null default true;
create index if not exists ix_library_titles_opac on library_titles (tenant_id) where is_opac and deleted_at is null;
