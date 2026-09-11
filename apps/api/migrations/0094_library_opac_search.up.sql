-- Regression fix: a reservation had no record of which copy was set aside
-- for it once ready, so a copy in status 'reserved' could not be traced
-- back to the member allowed to borrow it, and cancelling a ready hold
-- could not release a specific copy. held_copy_id closes that loop; the
-- expiry index is the periodic job's scan path (nothing previously
-- released a copy past its ready hold's expires_at).
alter table library_reservations add column held_copy_id uuid references library_copies (id) on delete set null;
create index ix_library_reservations_held_copy on library_reservations (held_copy_id) where held_copy_id is not null;
create index if not exists ix_library_reservations_ready_expiry on library_reservations (status, expires_at)
  where status = 'ready';

alter table library_titles add column if not exists search_vector tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(author, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(isbn, '')), 'C')
) stored;
create index if not exists ix_library_titles_search_vector on library_titles using gin (search_vector);
