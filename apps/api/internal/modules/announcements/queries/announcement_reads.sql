-- name: MarkAnnouncementRead :exec
insert into announcement_reads (announcement_id, user_id, tenant_id)
values ($1, $2, $3)
on conflict (announcement_id, user_id) do nothing;

-- name: CountAnnouncementReads :one
select count(*) from announcement_reads where tenant_id = $1 and announcement_id = $2;

-- name: ListReadAnnouncementIDsForUser :many
select announcement_id from announcement_reads
where tenant_id = $1 and user_id = $2 and announcement_id = any(sqlc.arg(announcement_ids)::uuid[]);
