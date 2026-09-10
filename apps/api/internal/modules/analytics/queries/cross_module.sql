-- name: AnalyticsListActiveTenants :many
-- cross-module read: tenants is the platform-wide registry owned by the
-- school module, the same read notifications' ListActiveTenantsForMaintenance
-- already does for its own periodic jobs. Not RLS-protected: this loops
-- one tenant at a time before any tenant context is set, never queries
-- across tenants in one statement.
select id from tenants where status = 'active';

-- name: AnalyticsListActiveStudents :many
-- cross-module read: enrollments (academic) is the roster the recompute
-- job scores, mirroring attendance's own ListActiveEnrollments.
select e.student_user_id, e.class_id
from enrollments e
where e.tenant_id = $1 and e.academic_year_id = $2 and e.status = 'active';

-- name: AnalyticsGetHomeroomClassID :one
-- cross-module read: duty slug 'homeroom', the same lookup as attendance's
-- GetHomeroomClassForAttendance (docs/analysis/backend-inventory.md
-- section 1.9's global-corrector rule).
select da.scope_class_id
from duty_assignments da
join duty_types dt on dt.id = da.duty_type_id
where da.tenant_id = $1 and da.academic_year_id = $2 and da.user_id = $3
  and dt.slug = 'homeroom' and da.is_active and dt.is_active and dt.deleted_at is null
limit 1;

-- name: AnalyticsHasActiveDuty :one
-- cross-module read: same slugs ("counselor", "leadership") discipline's
-- counseling visibility already uses.
select exists (
  select 1 from duty_assignments da
  join duty_types dt on dt.id = da.duty_type_id
  where da.tenant_id = $1 and da.academic_year_id = $2 and da.user_id = $3 and dt.slug = $4
    and da.is_active and dt.is_active and dt.deleted_at is null
);
