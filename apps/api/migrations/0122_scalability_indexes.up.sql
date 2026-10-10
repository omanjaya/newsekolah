-- Scalability audit (docs/analysis/audit-skalabilitas-2026-10-10.md).
-- Plain CREATE INDEX on purpose: golang-migrate runs each file as one
-- multi-statement batch, which cannot contain CREATE INDEX CONCURRENTLY, and
-- audit_logs is partitioned (CONCURRENTLY is not supported on a partitioned
-- parent anyway). The build lock is short at rollout size; for a deployment
-- with hundreds of millions of audit rows, build per partition out of band.

-- ListAuditLogs orders by id desc inside one tenant. With only
-- (tenant_id, occurred_at desc) and the (id, occurred_at) primary key, the
-- planner walks the primary key backwards and discards every other tenant's
-- rows (measured: 250k rows filtered, 146 ms for the largest tenant at 650k
-- audit rows, and worse for a small tenant).
create index ix_audit_logs_tenant_id_desc on audit_logs (tenant_id, id desc);

-- Library period reports and the monthly report filter loans by
-- (tenant_id, borrowed_at range); only (tenant_id) was indexed, so each
-- report sequentially scanned every loan the school ever made.
create index ix_library_loans_tenant_borrowed on library_loans (tenant_id, borrowed_at);

-- Discipline dashboards read violations by tenant and date range without a
-- year or student; only per-student and per-tenant indexes existed.
create index ix_violation_records_tenant_occurred on violation_records (tenant_id, occurred_on);

-- Attendance lookups by tenant and date without an academic year (daily
-- status of one student, force-submit) could only reach the
-- (tenant_id, academic_year_id, date) index through a bitmap over the whole
-- tenant; this lets them range-scan the date directly.
create index ix_attendance_sessions_tenant_date on attendance_sessions (tenant_id, date);

-- The admin dashboard login histogram filters login_attempts by
-- (tenant_id, success, occurred_at >= window); the existing indexes lead with
-- (tenant_id, username) or ip, so it scanned every attempt of the tenant.
-- Also the access path a retention job needs (login_attempts has none yet).
create index ix_login_attempts_tenant_occurred on login_attempts (tenant_id, occurred_at desc);
