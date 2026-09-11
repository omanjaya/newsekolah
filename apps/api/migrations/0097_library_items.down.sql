drop table if exists library_barcode_sequences;
drop table if exists library_accession_sequences;

-- Reverse the 0097 extension of library_item_events (created by 0093,
-- which owns dropping the table itself in its own down migration).
alter table library_item_events drop constraint library_item_events_event_type_check;
alter table library_item_events add constraint library_item_events_event_type_check check (
  event_type in ('borrowed', 'returned', 'renewed', 'lost', 'damaged', 'reserved', 'stocktake')
);
alter table library_item_events drop column if exists to_status;
alter table library_item_events drop column if exists from_status;
alter table library_item_events rename column actor_user_id to created_by;
alter table library_item_events rename constraint library_item_events_note_check to library_item_events_notes_check;
alter table library_item_events rename column note to notes;

alter table library_copies drop constraint library_copies_status_check;
alter table library_copies add constraint library_copies_status_check check (
  status in ('available', 'on_loan', 'reserved', 'withdrawn')
);

drop index if exists ix_library_copies_rfid;
drop index if exists ix_library_copies_location;
drop index if exists ux_library_copies_accession_number;
-- is_opac is left alone: migration 0093 (circulation) owns it.
alter table library_copies
  drop column if exists access,
  drop column if exists rfid,
  drop column if exists price,
  drop column if exists partner_id,
  drop column if exists source_id,
  drop column if exists location_id,
  drop column if exists category_id,
  drop column if exists call_number,
  drop column if exists copy_number,
  drop column if exists accession_number;
