-- name: InsertNotification :one
insert into notifications (tenant_id, user_id, kind, title, body, href, data, announcement_id)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: ListNotificationsForUser :many
-- hidden_kinds are the kinds of every module the tenant switched off
-- (notifications domain.HiddenKinds): those rows stay stored but are left
-- out of the inbox, the unread count and the digest until the module is
-- switched on again. An empty array hides nothing.
select *
from notifications
where tenant_id = sqlc.arg(tenant_id)::uuid
  and user_id = sqlc.arg(user_id)::uuid
  and kind <> all(sqlc.arg(hidden_kinds)::text[])
  and (sqlc.arg(unread_only)::boolean = false or read_at is null)
  and (sqlc.arg(search)::text = '' or title ilike '%' || sqlc.arg(search) || '%' or body ilike '%' || sqlc.arg(search) || '%')
  and (sqlc.arg(kind)::text = '' or kind = sqlc.arg(kind)::text)
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
-- Leaves hidden_kinds unread (see ListNotificationsForUser): the caller only
-- marks what it can see, so a switched-off module's items come back unread.
update notifications
set read_at = now()
where tenant_id = sqlc.arg(tenant_id)::uuid
  and user_id = sqlc.arg(user_id)::uuid
  and read_at is null
  and kind <> all(sqlc.arg(hidden_kinds)::text[]);

-- name: CountUnreadNotifications :one
-- hidden_kinds: see ListNotificationsForUser.
select count(*)
from notifications
where tenant_id = sqlc.arg(tenant_id)::uuid
  and user_id = sqlc.arg(user_id)::uuid
  and read_at is null
  and kind <> all(sqlc.arg(hidden_kinds)::text[]);

-- name: ListUnreadNotificationsSince :many
-- Feeds the daily digest job: notifications created since the recipient's
-- last digest run, still unread at digest time. hidden_kinds: see
-- ListNotificationsForUser.
select *
from notifications
where tenant_id = sqlc.arg(tenant_id)::uuid
  and user_id = sqlc.arg(user_id)::uuid
  and read_at is null
  and created_at >= sqlc.arg(since)::timestamptz
  and kind <> all(sqlc.arg(hidden_kinds)::text[])
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
