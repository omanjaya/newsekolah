-- name: StaffAttendanceGetFeatureFlag :one
-- Reads the shared feature_flags table (owned by platform, migration
-- 0001) directly within the caller's ordinary tenant-scoped transaction:
-- the tenant_isolation policy on feature_flags already allows this, no
-- platform_admin escalation needed, per
-- docs/03-layered-architecture.md section 5 ("setiap modul ... memeriksa
-- school.feature_flags").
select enabled from feature_flags where tenant_id = $1 and module = $2;

-- name: StaffAttendanceGetEmployeeName :one
select name from users where tenant_id = $1 and id = $2;
