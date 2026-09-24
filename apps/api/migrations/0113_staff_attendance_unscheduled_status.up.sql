-- ComputeLateness used to collapse two different situations into
-- "holiday": the academic calendar saying today is not a school day
-- (a real holiday), and the employee simply having no weekly schedule row
-- for this weekday at all (never configured). The check-in screen then
-- showed "Libur" on an ordinary Monday for anyone whose schedule was never
-- set up, while the check-in button stayed active -- a contradiction. The
-- two are now told apart: "unscheduled" is a new status for "no schedule
-- configured", distinct from a genuine "holiday".
alter table staff_attendance_records drop constraint staff_attendance_records_status_code_check;
alter table staff_attendance_records add constraint staff_attendance_records_status_code_check check (
  status_code in ('present', 'late', 'absent', 'on_leave', 'holiday', 'incomplete', 'unscheduled')
);
