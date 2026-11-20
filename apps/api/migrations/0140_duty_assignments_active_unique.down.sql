-- Reverses 0140_duty_assignments_active_unique.up.sql's index and restores
-- the original table constraint. Duplicates ended by the up migration stay
-- ended: they were accidental double submits, not a state to restore.
drop index if exists ux_duty_assignments_active;

alter table duty_assignments
  add unique (academic_year_id, duty_type_id, user_id, scope_class_id, scope_student_id);
