-- name: ListActiveTenantsForReportSchedules :many
-- cross-module read: tenants is the platform-wide registry owned by the
-- school module and is not RLS-protected (the same justification as
-- notifications' identical query -- tenant resolution must work before
-- any tenant context exists). The hourly report-schedule job loops one
-- tenant at a time rather than ever joining across tenants.
select id, timezone from tenants where status = 'active';

-- name: GetReportScheduleTenantTimezone :one
select timezone from tenants where id = $1;
