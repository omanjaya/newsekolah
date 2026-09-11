-- name: CreateLibraryVisit :one
insert into library_visits (tenant_id, member_user_id, visitor_name, kind, purpose, group_size, source, visited_at, created_by)
values ($1, sqlc.narg(member_user_id)::uuid, $2, $3, $4, $5, $6, $7, sqlc.narg(created_by)::uuid)
returning *;

-- name: GetLastVisitForMember :one
select * from library_visits where tenant_id = $1 and member_user_id = $2 order by visited_at desc limit 1;

-- name: ListVisitsForRange :many
select * from library_visits where tenant_id = $1 and visited_at >= $2 and visited_at < $3 order by visited_at desc;

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
