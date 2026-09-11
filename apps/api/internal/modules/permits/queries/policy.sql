-- name: GetLatestTenantPolicyForPermits :one
select * from tenant_policies
where tenant_id = $1 and kind = $2
order by version desc
limit 1;

-- name: CreateTenantPolicyForPermits :one
insert into tenant_policies (tenant_id, kind, version, config, effective_from, created_by)
values ($1, $2, $3, $4, $5, $6)
on conflict (tenant_id, kind, version) do nothing
returning *;
