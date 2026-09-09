-- name: AcademicGetCalendarPolicy :one
-- Reads the tenant's current "calendar" policy (owned by the platform/tenant
-- domain, table tenant_policies): the effective row as of asOf, i.e. the
-- highest version whose effective_from has passed. Read-only, additive --
-- this module does not write tenant_policies.
select config from tenant_policies
where tenant_id = $1 and kind = 'calendar' and effective_from <= $2
order by effective_from desc, version desc
limit 1;
