-- name: CreateVisit :one
insert into visitor_visits (
  tenant_id, expected_guest_id, full_name, organization, host_user_id, purpose,
  id_checked, id_type, badge_number, badge_asset_id, arrived_at, checked_in_by
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
returning *;

-- name: GetVisit :one
select * from visitor_visits where tenant_id = $1 and id = $2;

-- name: CheckOutVisit :one
update visitor_visits set departed_at = $3, checked_out_by = $4
where tenant_id = $1 and id = $2 and departed_at is null
returning *;

-- name: ListOnCampus :many
-- The gate board: everyone who has not signed out, oldest arrival first.
select * from visitor_visits
where tenant_id = $1 and departed_at is null
order by arrived_at;

-- name: ListVisits :many
select * from visitor_visits
where tenant_id = $1
  and arrived_at >= $2 and arrived_at < $3
order by arrived_at desc
limit $4 offset $5;

-- name: CountVisitsInRange :one
select count(*)::int as total from visitor_visits
where tenant_id = $1 and arrived_at >= $2 and arrived_at < $3;

-- name: AverageVisitMinutesInRange :one
select coalesce(avg(extract(epoch from (departed_at - arrived_at)) / 60), 0)::float8 as avg_minutes
from visitor_visits
where tenant_id = $1 and arrived_at >= $2 and arrived_at < $3 and departed_at is not null;

-- name: CountStillOnCampusInRange :one
select count(*)::int as total from visitor_visits
where tenant_id = $1 and arrived_at >= $2 and arrived_at < $3 and departed_at is null;
