-- Stocktake fixes: an unrecognised scan is recorded as "rejected" instead
-- of failing with a 404 (so copy_id must be nullable), a scan can note the
-- location a copy was found in (to detect misplaced copies), and a
-- session's reconciliation is persisted at close instead of being
-- returned once and lost.

alter table library_stocktake_scans rename column barcode to raw_code;
alter table library_stocktake_scans alter column copy_id drop not null;
alter table library_stocktake_scans
  add column outcome text not null default 'found' check (outcome in ('found', 'rejected')),
  add column location_id uuid references library_locations (id);
alter table library_stocktake_scans drop constraint library_stocktake_scans_stocktake_id_copy_id_key;
create unique index ux_library_stocktake_scans_stocktake_copy on library_stocktake_scans (stocktake_id, copy_id)
  where copy_id is not null;

alter table library_stocktakes
  add column missing_count int not null default 0,
  add column unexpected_count int not null default 0,
  add column misplaced_count int not null default 0,
  add column mark_missing_as text not null default 'none' check (mark_missing_as in ('lost', 'unknown', 'none'));

create table library_stocktake_results (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  stocktake_id uuid not null references library_stocktakes (id) on delete cascade,
  copy_id uuid references library_copies (id) on delete set null,
  outcome text not null check (outcome in ('missing', 'unexpected', 'misplaced')),
  found_location_id uuid references library_locations (id),
  created_at timestamptz not null default now()
);
create index ix_library_stocktake_results_stocktake on library_stocktake_results (tenant_id, stocktake_id, outcome);
alter table library_stocktake_results enable row level security;
alter table library_stocktake_results force row level security;
create policy tenant_isolation on library_stocktake_results
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
