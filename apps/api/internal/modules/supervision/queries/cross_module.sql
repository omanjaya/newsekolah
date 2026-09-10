-- name: SupervisionHasActiveDuty :one
-- cross-module read: duty_assignments/duty_types (identity), for resolving
-- whether a reader may open an observation report (leadership).
select exists (
  select 1 from duty_assignments da
  join duty_types dt on dt.id = da.duty_type_id
  where da.tenant_id = $1 and da.academic_year_id = $2 and da.user_id = $3 and dt.slug = $4
    and da.is_active and dt.is_active and dt.deleted_at is null
    and da.starts_on <= current_date and (da.ends_on is null or da.ends_on >= current_date)
)::bool as has_duty;

-- name: SupervisionTeacherName :one
select name from users where tenant_id = $1 and id = $2;
