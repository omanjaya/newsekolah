-- INLISLite-style bibliographic fields for library_titles
-- (docs/06-database-schema.md:246-248), plus fulltext search.

alter table library_titles
  add column control_number text not null default '' check (length(control_number) <= 60),
  add column responsibility text not null default '' check (length(responsibility) <= 300),
  add column additional_authors text not null default '' check (length(additional_authors) <= 500),
  add column publish_place text not null default '' check (length(publish_place) <= 120),
  add column edition text not null default '' check (length(edition) <= 60),
  add column pages text not null default '' check (length(pages) <= 60),
  add column illustration text not null default '' check (length(illustration) <= 120),
  add column dimensions text not null default '' check (length(dimensions) <= 60),
  add column issn text not null default '' check (length(issn) <= 32),
  add column ddc_number text not null default '' check (length(ddc_number) <= 20),
  add column call_number text not null default '' check (length(call_number) <= 60),
  add column subjects text not null default '' check (length(subjects) <= 500),
  add column literary_form text not null default '' check (length(literary_form) <= 60),
  add column target_audience text not null default '' check (length(target_audience) <= 60),
  add column notes text not null default '' check (length(notes) <= 1000),
  add column abstract text not null default '' check (length(abstract) <= 2000),
  add column material_type_id uuid references library_material_types (id),
  add column is_opac boolean not null default true;

create unique index ux_library_titles_control_number on library_titles (tenant_id, control_number)
  where control_number <> '' and deleted_at is null;

-- Fulltext search over the fields a librarian actually searches by; 'simple'
-- avoids depending on an installed Indonesian text search configuration.
alter table library_titles add column search_vector tsvector
  generated always as (
    to_tsvector('simple',
      coalesce(title, '') || ' ' || coalesce(subtitle, '') || ' ' || coalesce(author, '') || ' ' ||
      coalesce(additional_authors, '') || ' ' || coalesce(subjects, '') || ' ' || coalesce(abstract, '') || ' ' ||
      coalesce(publisher, ''))
  ) stored;
create index ix_library_titles_search_vector on library_titles using gin (search_vector);
create index ix_library_titles_material_type on library_titles (tenant_id, material_type_id);
