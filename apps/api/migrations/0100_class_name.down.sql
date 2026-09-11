drop index if exists ux_classes_academic_year_id_name;
alter table classes add constraint classes_academic_year_id_name_key unique (academic_year_id, name);

alter table classes drop constraint classes_name_check;
alter table classes add constraint classes_name_check check (length(name) <= 100);
