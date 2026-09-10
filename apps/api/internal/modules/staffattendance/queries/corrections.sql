-- name: CreateStaffAttendanceCorrection :one
insert into staff_attendance_corrections (tenant_id, record_id, reason, previous_snapshot, new_snapshot, created_by)
values ($1, $2, $3, $4, $5, $6)
returning *;

-- name: ListStaffAttendanceCorrectionsByRecord :many
select * from staff_attendance_corrections
where tenant_id = $1 and record_id = $2
order by created_at desc;
