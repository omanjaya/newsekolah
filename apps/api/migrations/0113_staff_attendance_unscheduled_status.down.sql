alter table staff_attendance_records drop constraint staff_attendance_records_status_code_check;
alter table staff_attendance_records add constraint staff_attendance_records_status_code_check check (
  status_code in ('present', 'late', 'absent', 'on_leave', 'holiday', 'incomplete')
);
