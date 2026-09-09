drop index if exists ix_academic_years_archived_at;
alter table academic_years drop column if exists archived_at;
