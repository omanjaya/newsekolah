-- name: AcademicCreateRoom :one
insert into rooms (tenant_id, code, name, capacity)
values ($1, $2, $3, $4)
returning *;

-- name: AcademicUpdateRoom :one
update rooms set code = $3, name = $4, capacity = $5, updated_at = now()
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;

-- name: AcademicGetRoomByID :one
select * from rooms where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: AcademicListRooms :many
select sqlc.embed(rooms), count(*) over () as total_count
from rooms
where tenant_id = $1
  and deleted_at is null
  and (sqlc.narg('search')::text is null or name ilike '%' || sqlc.narg('search') || '%' or code ilike '%' || sqlc.narg('search') || '%')
order by name
limit $2 offset $3;

-- name: AcademicSoftDeleteRoom :exec
update rooms set deleted_at = now(), updated_at = now() where tenant_id = $1 and id = $2;

-- name: AcademicCountClassesForRoom :one
select count(*) from classes where tenant_id = $1 and room_id = $2 and deleted_at is null;
