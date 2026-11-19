-- The leadership duty's default permission set
-- (internal/platform/authz/duty_defaults.go) now includes
-- issue_scan_tokens: the leadership stage of a late arrival or an exit
-- permit is approved by showing the student a stage QR minted through
-- POST /v1/scan-tokens, and a principal holding the duty has no other
-- source of that permission. Duty defaults are applied only when a tenant
-- is provisioned, so tenants provisioned earlier need the grant added here.
insert into duty_permissions (duty_type_id, permission_code, tenant_id)
select duty_types.id, 'issue_scan_tokens', duty_types.tenant_id
from duty_types
where duty_types.slug = 'leadership'
on conflict (duty_type_id, permission_code) do nothing;
