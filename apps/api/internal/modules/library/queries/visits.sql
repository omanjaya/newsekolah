-- name: CreateLibraryVisit :one
insert into library_visits (tenant_id, member_user_id, visitor_name, kind, purpose, group_size, source, visited_at, created_by)
values ($1, sqlc.narg(member_user_id)::uuid, $2, $3, $4, $5, $6, $7, sqlc.narg(created_by)::uuid)
returning *;

-- name: GetLastVisitForMember :one
select * from library_visits where tenant_id = $1 and member_user_id = $2 order by visited_at desc limit 1;

-- name: ListVisitsForRange :many
-- from_day..to_day are whole calendar days (inclusive) as the school lives
-- them, tz its IANA zone: the bounds are that zone's midnights, so a visit
-- at 07:30 in UTC+8 sits on its own local day, not the previous UTC one.
-- Paged: the range comes straight from the client, so a year-wide range
-- is walked a page at a time instead of returned whole.
select * from library_visits
where tenant_id = sqlc.arg(tenant_id)
  and visited_at >= (sqlc.arg(from_day)::date::timestamp at time zone sqlc.arg(tz)::text)
  and visited_at < ((sqlc.arg(to_day)::date + 1)::timestamp at time zone sqlc.arg(tz)::text)
order by visited_at desc, id desc
limit sqlc.arg(row_limit)::int offset sqlc.arg(row_offset)::int;

-- name: TodayVisitSummary :one
select
  count(*)::int as total_visits,
  count(distinct member_user_id)::int as unique_members,
  coalesce(sum(group_size), 0)::int as total_people
from library_visits
where tenant_id = $1 and visited_at >= $2 and visited_at < $3;

-- name: CreateReadInPlace :one
insert into library_read_in_place (tenant_id, copy_id, member_user_id, visitor_name, started_at, created_by)
values ($1, $2, sqlc.narg(member_user_id)::uuid, $3, $4, sqlc.narg(created_by)::uuid)
returning *;

-- name: ListReadInPlaceForCopy :many
select * from library_read_in_place where tenant_id = $1 and copy_id = $2 order by started_at desc;
