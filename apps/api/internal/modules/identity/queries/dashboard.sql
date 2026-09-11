-- name: CountActiveUsersByProfileKind :many
-- Backs the admin dashboard's "active users per profile kind" panel.
select up.kind, count(*)::bigint as total
from users u
join user_profiles up on up.user_id = u.id
where u.tenant_id = $1 and u.status = 'active' and u.deleted_at is null
group by up.kind;

-- name: LoginHistogramByHour :many
-- Hour-of-day (0-23, tenant-local) histogram of successful logins in the
-- last 7 days, for the admin dashboard. Converted with sqlc.arg('tz')
-- rather than read as bare UTC: a usage-pattern chart is only readable
-- against the hours staff actually work, and UTC is 7-9 hours off for
-- every Indonesian timezone.
select extract(hour from occurred_at at time zone sqlc.arg('tz')::text)::int as hour, count(*)::bigint as total
from login_attempts
where tenant_id = $1 and success = true and occurred_at >= $2
group by hour;

-- name: GetTenantTimezoneForIdentity :one
-- Mirrors permits/attendance's GetTenantTimezoneFor*: the admin
-- dashboard's login histogram must bucket in the tenant's own timezone,
-- never the server's UTC clock.
select timezone from tenants where id = $1;
