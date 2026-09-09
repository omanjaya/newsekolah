-- name: InsertNotification :one
insert into notifications (tenant_id, user_id, kind, title, body, href, data, announcement_id)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: ListNotificationsForUser :many
select *
from notifications
where tenant_id = sqlc.arg(tenant_id)::uuid
  and user_id = sqlc.arg(user_id)::uuid
  and (sqlc.arg(unread_only)::boolean = false or read_at is null)
  and (
    sqlc.arg(has_cursor)::boolean = false
    or created_at < sqlc.arg(cursor_created_at)::timestamptz
    or (created_at = sqlc.arg(cursor_created_at)::timestamptz and id < sqlc.arg(cursor_id)::uuid)
  )
order by created_at desc, id desc
limit sqlc.arg(page_limit)::int;

-- name: GetNotificationByID :one
select * from notifications where tenant_id = $1 and id = $2;

-- name: MarkNotificationRead :exec
update notifications
set read_at = now()
where tenant_id = $1 and user_id = $2 and id = $3 and read_at is null;

-- name: MarkAllNotificationsRead :exec
update notifications
set read_at = now()
where tenant_id = $1 and user_id = $2 and read_at is null;

-- name: CountUnreadNotifications :one
select count(*) from notifications where tenant_id = $1 and user_id = $2 and read_at is null;

-- name: ListUnreadNotificationsSince :many
-- Feeds the daily digest job: notifications created since the recipient's
-- last digest run, still unread at digest time.
select *
from notifications
where tenant_id = $1 and user_id = $2 and read_at is null and created_at >= $3
order by created_at desc;

-- name: DeleteReadNotificationsOlderThan :execrows
-- Retention: read notifications older than the cutoff (180 days, per
-- docs/06-database-schema.md section 10). Scoped by tenant_id explicitly
-- (not just RLS) since the maintenance jobs that call this loop one tenant
-- at a time -- see docs/08-security.md section 4 on always filtering by
-- tenant even where RLS would also catch it.
delete from notifications
where tenant_id = $1 and created_at < $2 and read_at is not null;

-- name: EnsureNotificationsPartition :exec
select ensure_notifications_partition($1);
