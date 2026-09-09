-- name: ListActiveDutyAssignmentsForUser :many
select
  dt.slug,
  dt.name,
  dt.scope_kind,
  da.scope_class_id,
  da.scope_student_id
from duty_assignments da
join duty_types dt on dt.id = da.duty_type_id
where da.tenant_id = $1
  and da.user_id = $2
  and da.academic_year_id = $3
  and da.is_active
  and dt.is_active
  and dt.deleted_at is null
  and da.starts_on <= current_date
  and (da.ends_on is null or da.ends_on >= current_date);

-- name: ListPermissionCodesForDutyTypes :many
select distinct duty_type_id, permission_code from duty_permissions where duty_type_id = any(sqlc.arg(duty_type_ids)::uuid[]);

-- name: CreateDutyType :one
insert into duty_types (tenant_id, slug, name, scope_kind)
values ($1, $2, $3, $4)
returning *;

-- name: AddDutyPermission :exec
insert into duty_permissions (duty_type_id, permission_code, tenant_id)
values ($1, $2, $3)
on conflict do nothing;

-- name: GetDutyTypeBySlug :one
select * from duty_types where tenant_id = $1 and slug = $2;

-- name: CreateDutyAssignment :one
insert into duty_assignments (tenant_id, academic_year_id, duty_type_id, user_id, scope_class_id, scope_student_id, starts_on)
values ($1, $2, $3, $4, $5, $6, $7)
returning *;
