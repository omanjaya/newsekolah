-- name: ListTenantSettingsByPrefix :many
select * from tenant_settings where tenant_id = $1 and key like $2 order by key;

-- name: UpsertTenantSetting :exec
insert into tenant_settings (tenant_id, key, value, updated_by)
values ($1, $2, $3, $4)
on conflict (tenant_id, key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

-- name: GetPlatformSetting :one
select value from platform_settings where key = $1;
