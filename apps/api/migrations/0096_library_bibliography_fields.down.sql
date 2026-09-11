drop index if exists ix_library_titles_material_type;
drop index if exists ix_library_titles_search_vector;
alter table library_titles drop column if exists search_vector;
-- Restore migration 0094's narrower search_vector (title/author/isbn):
-- is_opac is left alone below -- migration 0093 (circulation) owns it.
alter table library_titles add column search_vector tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(author, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(isbn, '')), 'C')
) stored;
create index ix_library_titles_search_vector on library_titles using gin (search_vector);
drop index if exists ux_library_titles_control_number;
alter table library_titles
  drop column if exists material_type_id,
  drop column if exists abstract,
  drop column if exists notes,
  drop column if exists target_audience,
  drop column if exists literary_form,
  drop column if exists subjects,
  drop column if exists call_number,
  drop column if exists ddc_number,
  drop column if exists issn,
  drop column if exists dimensions,
  drop column if exists illustration,
  drop column if exists pages,
  drop column if exists edition,
  drop column if exists publish_place,
  drop column if exists additional_authors,
  drop column if exists responsibility,
  drop column if exists control_number;
