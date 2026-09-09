-- name: CreateAttendanceCorrection :one
insert into attendance_corrections (tenant_id, entry_id, old_status, new_status, reason, corrected_by)
values ($1, $2, $3, $4, $5, $6)
returning *;

-- name: ListCorrectionsByEntry :many
select * from attendance_corrections where tenant_id = $1 and entry_id = $2 order by corrected_at desc;
