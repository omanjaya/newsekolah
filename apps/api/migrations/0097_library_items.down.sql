drop table if exists library_barcode_sequences;
drop table if exists library_accession_sequences;
drop table if exists library_item_events;

alter table library_copies drop constraint library_copies_status_check;
alter table library_copies add constraint library_copies_status_check check (
  status in ('available', 'on_loan', 'reserved', 'withdrawn')
);

drop index if exists ix_library_copies_rfid;
drop index if exists ix_library_copies_location;
drop index if exists ux_library_copies_accession_number;
alter table library_copies
  drop column if exists access,
  drop column if exists rfid,
  drop column if exists is_opac,
  drop column if exists price,
  drop column if exists partner_id,
  drop column if exists source_id,
  drop column if exists location_id,
  drop column if exists category_id,
  drop column if exists call_number,
  drop column if exists copy_number,
  drop column if exists accession_number;
