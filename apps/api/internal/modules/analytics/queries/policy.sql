-- name: AnalyticsGetLatestPolicy :one
select config, version from analytics_policies
where tenant_id = $1
order by version desc
limit 1;

-- name: AnalyticsCreatePolicy :exec
insert into analytics_policies (tenant_id, version, config, effective_from, created_by)
values ($1, $2, $3, $4, $5)
on conflict (tenant_id, version) do nothing;
