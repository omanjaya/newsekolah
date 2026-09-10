-- name: VisitorsHasActiveDuty :one
-- cross-module read: duty_assignments/duty_types (identity/school), to
-- decide whether a reader may open an incident as campus security or
-- school leadership rather than only its reporter.
select exists (
  select 1 from duty_assignments da
  join duty_types dt on dt.id = da.duty_type_id
  where da.tenant_id = $1 and da.academic_year_id = $2 and da.user_id = $3 and dt.slug = $4
    and da.is_active and dt.is_active and dt.deleted_at is null
    and da.starts_on <= current_date and (da.ends_on is null or da.ends_on >= current_date)
    and dt.scope_kind = 'school'
)::bool as has_duty;
