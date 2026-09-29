-- name: MentoringHasActiveDuty :one
-- cross-module read: duty_assignments/duty_types (identity), for resolving
-- whether a reader may open a meeting note (counselor, leadership).
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

-- name: MentoringGetTenantTimezone :one
-- Mirrors attendance's GetTenantTimezoneForAttendance / permits'
-- GetTenantTimezoneForPermits: mentoring must resolve HasActiveDuty's
-- duty window in the tenant's own timezone, never the server's UTC clock.
select timezone from tenants where id = $1;

-- name: MentoringStudentInfo :one
-- cross-module read: users (identity) and enrollments/classes (academic),
-- for the name and class shown in the mentor's per-student view.
select u.name as student_name, coalesce(c.name, '') as class_name
from users u
left join enrollments e on e.student_user_id = u.id and e.academic_year_id = $2 and e.status = 'active'
left join classes c on c.id = e.class_id
where u.tenant_id = $1 and u.id = $3;
