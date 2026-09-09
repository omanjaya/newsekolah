-- name: DisciplineGetLatestPolicy :one
select config, version from tenant_policies
where tenant_id = $1 and kind = $2
order by version desc
limit 1;

-- name: DisciplineCreatePolicy :exec
insert into tenant_policies (tenant_id, kind, version, config, effective_from, created_by)
values ($1, $2, $3, $4, $5, $6)
on conflict (tenant_id, kind, version) do nothing;

-- name: DisciplineStudentSnapshot :one
-- cross-module read: users (identity) and enrollments/classes (academic),
-- for the name and class printed on a warning letter.
select u.name as student_name, coalesce(c.name, '') as class_name, coalesce(sp.guardian_name, '') as guardian_name
from users u
left join enrollments e on e.student_user_id = u.id and e.academic_year_id = $3 and e.status = 'active'
left join classes c on c.id = e.class_id
left join student_profiles sp on sp.user_id = u.id
where u.tenant_id = $1 and u.id = $2;

-- name: DisciplineHasActiveDuty :one
select exists (
  select 1 from duty_assignments da
  join duty_types dt on dt.id = da.duty_type_id
  where da.tenant_id = $1 and da.academic_year_id = $2 and da.user_id = $3 and dt.slug = $4
    and da.is_active and dt.is_active and dt.deleted_at is null
    and da.starts_on <= current_date and (da.ends_on is null or da.ends_on >= current_date)
    and (dt.scope_kind = 'school' or (sqlc.narg(class_id)::uuid is not null and da.scope_class_id = sqlc.narg(class_id)::uuid))
)::bool as has_duty;

-- name: DisciplineActiveClassID :one
select class_id from enrollments
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3 and status = 'active'
limit 1;
