-- One offering per subject, grade level and academic year. The service
-- already maps a unique violation on subject_offerings to
-- ACADEMIC_OFFERING_EXISTS (409) and the web shows its message, but the
-- table never had the constraint, so a second "Kimia / Kelas X" offering
-- was silently saved beside the first.
--
-- Remove existing duplicates first, keeping the earliest row of each key
-- (ids are UUIDv7, so the smallest id is the oldest). NULLS NOT DISTINCT
-- makes two "all grades" (grade_level_id null) offerings of one subject a
-- duplicate too; it needs Postgres 15+, and every compose file runs 16.
delete from subject_offerings a
using subject_offerings b
where a.tenant_id = b.tenant_id
  and a.academic_year_id = b.academic_year_id
  and a.subject_id = b.subject_id
  and a.grade_level_id is not distinct from b.grade_level_id
  and a.id > b.id;

create unique index ux_subject_offerings_year_subject_grade
  on subject_offerings (tenant_id, academic_year_id, subject_id, grade_level_id)
  nulls not distinct;
