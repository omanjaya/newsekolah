-- Copy (item) fields the old app tracked: accession number (buku induk),
-- provenance references, and the full status/access vocabulary, plus the
-- per-copy event trail and the counters that generate accession numbers
-- and fallback barcodes without a race (docs/06-database-schema.md:246-248).

alter table library_copies
  add column accession_number text not null default '' check (length(accession_number) <= 40),
  add column copy_number int not null default 1 check (copy_number > 0),
  add column call_number text not null default '' check (length(call_number) <= 60),
  add column category_id uuid references library_collection_categories (id),
  add column location_id uuid references library_locations (id),
  add column source_id uuid references library_acquisition_sources (id),
  add column partner_id uuid references library_partners (id),
  add column price int not null default 0 check (price >= 0),
  add column rfid text not null default '' check (length(rfid) <= 64),
  add column access text not null default 'loanable' check (access in ('loanable', 'read_in_place', 'reference'));

-- is_opac already exists: migration 0093 (circulation, applied earlier)
-- added it guarded with `if not exists` for exactly this reason.
alter table library_copies add column if not exists is_opac boolean not null default true;

create unique index ux_library_copies_accession_number on library_copies (tenant_id, accession_number)
  where accession_number <> '';
create index ix_library_copies_location on library_copies (tenant_id, location_id);
create index ix_library_copies_rfid on library_copies (tenant_id, rfid) where rfid <> '';

-- The circulation status vocabulary grows from 4 to the old app's 10
-- values (Indonesian labels replaced with English codes per
-- docs/06-database-schema.md:246); condition stays a separate dimension
-- already used at return time (modules/library/service/loans.go).
alter table library_copies drop constraint library_copies_status_check;
alter table library_copies add constraint library_copies_status_check check (
  status in ('available', 'on_loan', 'reserved', 'damaged', 'lost', 'in_repair', 'processing', 'donated', 'reserve_stack', 'unknown')
);

-- library_item_events already exists: migration 0093 (circulation, applied
-- earlier) created it for the borrow/return/renew/lost trail. Extend it
-- with the catalogue's status-change columns and widen event_type to the
-- union of both vocabularies instead of recreating the table.
alter table library_item_events rename column notes to note;
alter table library_item_events rename constraint library_item_events_notes_check to library_item_events_note_check;
alter table library_item_events rename column created_by to actor_user_id;
alter table library_item_events add column from_status text not null default '';
alter table library_item_events add column to_status text not null default '';
alter table library_item_events drop constraint library_item_events_event_type_check;
alter table library_item_events add constraint library_item_events_event_type_check check (
  event_type in (
    'created', 'status_changed', 'circulation', 'stocktake',
    'borrowed', 'returned', 'renewed', 'lost', 'damaged', 'reserved'
  )
);

-- Accession numbers reset their running number every calendar year
-- (default pattern YYYY/99999); the fallback 11-digit barcode uses a flat
-- per-tenant counter instead. Both are advanced with an atomic
-- upsert-increment so concurrent creates never hand out the same number.
create table library_accession_sequences (
  tenant_id uuid not null references tenants (id) on delete cascade,
  year int not null,
  next_value bigint not null default 1,
  primary key (tenant_id, year)
);
alter table library_accession_sequences enable row level security;
alter table library_accession_sequences force row level security;
create policy tenant_isolation on library_accession_sequences
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table library_barcode_sequences (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  next_value bigint not null default 1
);
alter table library_barcode_sequences enable row level security;
alter table library_barcode_sequences force row level security;
create policy tenant_isolation on library_barcode_sequences
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
