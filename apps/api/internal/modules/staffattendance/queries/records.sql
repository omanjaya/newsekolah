-- name: UpsertStaffAttendanceRecord :one
insert into staff_attendance_records (
  tenant_id, employee_user_id, date, arrival_at, departure_at, status_code, late_minutes, early_leave_minutes,
  source, notes, created_by, updated_by
)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
on conflict (tenant_id, employee_user_id, date) do update set
  arrival_at = coalesce(excluded.arrival_at, staff_attendance_records.arrival_at),
  departure_at = coalesce(excluded.departure_at, staff_attendance_records.departure_at),
  status_code = excluded.status_code,
  late_minutes = excluded.late_minutes,
  early_leave_minutes = excluded.early_leave_minutes,
  source = excluded.source,
  updated_by = excluded.updated_by
returning *;

-- name: GetStaffAttendanceRecord :one
select * from staff_attendance_records where tenant_id = $1 and id = $2;

-- name: GetStaffAttendanceRecordByEmployeeDate :one
select * from staff_attendance_records where tenant_id = $1 and employee_user_id = $2 and date = $3;

-- name: ListStaffAttendanceRecordsByDate :many
select * from staff_attendance_records where tenant_id = $1 and date = $2;

-- name: ListStaffAttendanceRecordsByEmployeeRange :many
select * from staff_attendance_records
where tenant_id = $1 and employee_user_id = $2 and date >= $3 and date < $4
order by date;

-- name: ReplaceStaffAttendanceRecordFields :one
-- Used by a correction: writes the corrected fields directly (as opposed
-- to UpsertStaffAttendanceRecord's coalesce-on-conflict, which never
-- clears a timestamp back to NULL).
update staff_attendance_records set
  arrival_at = $3, departure_at = $4, status_code = $5, late_minutes = $6, early_leave_minutes = $7,
  notes = $8, updated_by = $9
where tenant_id = $1 and id = $2
returning *;
