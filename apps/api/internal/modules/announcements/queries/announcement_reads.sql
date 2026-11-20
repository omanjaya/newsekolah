-- name: MarkAnnouncementRead :exec
insert into announcement_reads (announcement_id, user_id, tenant_id)
values ($1, $2, $3)
on conflict (announcement_id, user_id) do nothing;

-- name: CountAnnouncementReads :one
select count(*) from announcement_reads where tenant_id = $1 and announcement_id = $2;

-- name: CountAnnouncementReadsByIDs :many
-- Read counts for a page of the admin list, in one round trip; an
-- announcement nobody has read has no row here (the caller reads it as 0).
select announcement_id, count(*)::bigint as read_count from announcement_reads
where tenant_id = $1 and announcement_id = any(sqlc.arg(announcement_ids)::uuid[])
group by announcement_id;

-- name: ListReadAnnouncementIDsForUser :many
select announcement_id from announcement_reads
where tenant_id = $1 and user_id = $2 and announcement_id = any(sqlc.arg(announcement_ids)::uuid[]);
