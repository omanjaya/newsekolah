-- name: CountActiveUsersByProfileKind :many
-- Backs the admin dashboard's "active users per profile kind" panel.
select up.kind, count(*)::bigint as total
from users u
join user_profiles up on up.user_id = u.id
where u.tenant_id = $1 and u.status = 'active' and u.deleted_at is null
group by up.kind;

-- name: LoginHistogramByHour :many
-- Hour-of-day (0-23, UTC) histogram of successful logins in the last 7
-- days, for the admin dashboard. UTC rather than tenant-local: unlike an
-- attendance day boundary this is a rough usage-pattern chart, not a
-- compliance cutoff, so it does not carry the "never compute in UTC"
-- rule docs/03 attaches to school-day boundaries.
select extract(hour from occurred_at)::int as hour, count(*)::bigint as total
from login_attempts
where tenant_id = $1 and success = true and occurred_at >= $2
group by hour;
