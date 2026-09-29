-- name: SupervisionHasActiveDuty :one
-- cross-module read: duty_assignments/duty_types (identity), for resolving
-- whether a reader may open an observation report (leadership).
-- today is the tenant-local calendar date (s.tenantNow), not current_date:
-- the Postgres session timezone is never set per tenant, so comparing
-- against bare current_date would evaluate the duty window in whatever
-- timezone the connection happens to be in, matching permits' HasActiveDuty.
select exists (
  select 1 from duty_assignments da
  join duty_types dt on dt.id = da.duty_type_id
  where da.tenant_id = $1 and da.academic_year_id = $2 and da.user_id = $3 and dt.slug = $4
    and da.is_active and dt.is_active and dt.deleted_at is null
    and da.starts_on <= sqlc.arg('today')::date and (da.ends_on is null or da.ends_on >= sqlc.arg('today')::date)
)::bool as has_duty;

-- name: SupervisionGetTenantTimezone :one
-- Mirrors attendance's GetTenantTimezoneForAttendance / permits'
-- GetTenantTimezoneForPermits: supervision must resolve HasActiveDuty's
-- duty window in the tenant's own timezone, never the server's UTC clock.
select timezone from tenants where id = $1;

-- name: SupervisionTeacherName :one
select name from users where tenant_id = $1 and id = $2;
