-- name: PlatformListTenants :many
select * from tenants where status <> 'deleted' order by created_at desc;

-- name: PlatformUpdateTenantStatus :one
update tenants set status = $2 where id = $1 returning *;

-- name: PlatformUpdateTenantDomain :one
update tenants set primary_domain = $2 where id = $1 returning *;

-- name: PlatformCountTenantUsers :one
select count(*) from users where tenant_id = $1 and deleted_at is null;

-- name: PlatformActiveAcademicYearLabel :one
select label from academic_years where tenant_id = $1 and is_active limit 1;

-- name: PlatformLastActivityAt :one
select max(occurred_at)::timestamptz as last_activity from audit_logs where tenant_id = $1;

-- name: PlatformListFeatureFlags :many
select module, enabled from feature_flags where tenant_id = $1 order by module;

-- name: PlatformUpsertFeatureFlag :one
insert into feature_flags (tenant_id, module, enabled)
values ($1, $2, $3)
on conflict (tenant_id, module) do update set enabled = excluded.enabled
returning *;

-- name: PlatformCreateExport :one
insert into tenant_exports (tenant_id, status) values ($1, 'pending') returning *;

-- name: PlatformGetExport :one
select * from tenant_exports where tenant_id = $1 and id = $2;

-- name: PlatformUpdateExportStatus :one
update tenant_exports
set status = $2, object_key = $3, error_message = $4, completed_at = $5
where id = $1
returning *;

-- name: PlatformExportUsers :many
select id, username, email, phone, name, status, created_at
from users
where tenant_id = $1 and deleted_at is null
order by created_at;

-- name: PlatformExportAcademicYears :many
select id, label, starts_on, ends_on, is_active
from academic_years
where tenant_id = $1
order by starts_on;

-- name: PlatformExportClasses :many
select id, name, capacity, created_at
from classes
where tenant_id = $1 and deleted_at is null
order by name;
