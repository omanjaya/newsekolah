-- name: ListActiveTenantsForMaintenance :many
-- cross-module read: tenants is the platform-wide registry owned by the
-- school module. Not RLS-protected (tenant resolution must work before any
-- tenant context exists). Used by the digest/retention/pruning periodic
-- jobs, which loop one tenant at a time rather than ever querying across
-- tenants in a single statement.
select id, timezone from tenants where status = 'active';

-- name: GetTenantTimezone :one
-- cross-module read: see ListActiveTenantsForMaintenance above.
select timezone from tenants where id = $1;
