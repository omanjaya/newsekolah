drop index if exists ix_library_titles_search_vector;
alter table library_titles drop column if exists search_vector;
drop index if exists ix_library_reservations_ready_expiry;
drop index if exists ix_library_reservations_held_copy;
alter table library_reservations drop column if exists held_copy_id;
