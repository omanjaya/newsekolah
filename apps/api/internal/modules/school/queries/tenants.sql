-- name: GetTenantByID :one
select * from tenants where id = $1;

-- name: GetTenantBySlug :one
select * from tenants where slug = $1;

-- name: GetTenantByDomain :one
select t.* from tenants t
left join tenant_domains d on d.tenant_id = t.id
where t.primary_domain = $1 or d.domain = $1
limit 1;

-- name: GetSingleTenant :one
select * from tenants order by created_at asc limit 1;

-- name: CreateTenant :one
insert into tenants (slug, name, education_level, timezone, locale, status, plan, primary_domain)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: SearchTenants :many
select * from tenants where name ilike $1 or slug ilike $1 order by name limit 20;

-- name: ListTenantIDs :many
select id from tenants where status <> 'deleted' order by created_at;
