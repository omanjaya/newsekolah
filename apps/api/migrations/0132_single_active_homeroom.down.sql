-- Reverses 0132_single_active_homeroom.up.sql's guard. The healed rows
-- (duplicate holders ended, classes.homeroom_teacher_id re-pointed) stay
-- as they are: they were inconsistent data, not a state to restore.
drop trigger if exists trg_duty_assignments_single_active_homeroom on duty_assignments;
drop function if exists guard_single_active_homeroom();
