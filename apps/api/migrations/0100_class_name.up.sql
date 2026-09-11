-- Widen classes.name to 150 characters (matching the old app's limit;
-- 100 was tighter than the reference for no documented reason) and let a
-- soft-deleted class's name be reused within the same academic year: the
-- old plain unique(academic_year_id, name) still counted a deleted row,
-- so recreating "X IPA 1" after deleting it failed with a name-exists
-- conflict.
alter table classes drop constraint classes_name_check;
alter table classes add constraint classes_name_check check (length(name) <= 150);

alter table classes drop constraint classes_academic_year_id_name_key;
create unique index ux_classes_academic_year_id_name on classes (academic_year_id, name) where deleted_at is null;
