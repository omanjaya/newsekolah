drop index if exists ix_library_titles_material_type;
drop index if exists ix_library_titles_search_vector;
alter table library_titles drop column if exists search_vector;
drop index if exists ux_library_titles_control_number;
alter table library_titles
  drop column if exists is_opac,
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
