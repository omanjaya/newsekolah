-- Adds the archive state that the academic module's academic-year workflow
-- needs on top of 0003_academic's is_active flag: an archived year is
-- neither active nor eligible to become active again without being
-- unarchived first (enforced in the academic module's service, not here).
alter table academic_years
  add column archived_at timestamptz;

create index ix_academic_years_archived_at on academic_years (tenant_id) where archived_at is not null;
