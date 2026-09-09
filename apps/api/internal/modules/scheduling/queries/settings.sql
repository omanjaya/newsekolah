-- name: GetTenantSettingValue :one
select value from tenant_settings where tenant_id = $1 and key = $2;
