-- name: CreateAnnouncement :one
insert into announcements (tenant_id, sender_user_id, title, body_html, body_text, audience, is_pinned, status, starts_at, ends_at)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
returning *;

-- name: GetAnnouncementByID :one
select * from announcements where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: UpdateAnnouncement :one
update announcements
set title = $3, body_html = $4, body_text = $5, audience = $6, is_pinned = $7, starts_at = $8, ends_at = $9
where tenant_id = $1 and id = $2 and deleted_at is null and status in ('draft', 'scheduled')
returning *;

-- name: UpdateAnnouncementStatus :one
update announcements
set status = $3, published_at = case when $3 = 'published' then now() else published_at end
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;

-- name: SetAnnouncementRecipientCount :exec
update announcements set recipient_count = $3 where tenant_id = $1 and id = $2;

-- name: DeleteAnnouncement :exec
update announcements set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: ListAnnouncementsForAdmin :many
select *
from announcements
where tenant_id = sqlc.arg(tenant_id)::uuid
  and deleted_at is null
  and (sqlc.arg(status_filter)::text = '' or status = sqlc.arg(status_filter)::text)
  and (
    sqlc.arg(has_cursor)::boolean = false
    or created_at < sqlc.arg(cursor_created_at)::timestamptz
    or (created_at = sqlc.arg(cursor_created_at)::timestamptz and id < sqlc.arg(cursor_id)::uuid)
  )
order by created_at desc, id desc
limit sqlc.arg(page_limit)::int;

-- name: ListDueScheduledAnnouncements :many
-- Drives the "announcements.publish_scheduled" periodic job.
select * from announcements
where status = 'scheduled' and deleted_at is null and starts_at <= now();

-- name: ListActiveAnnouncementsForUser :many
-- GET /v1/me/announcements: published, inside the active window, pinned
-- first then most recent. Recipient filtering (does this user's audience
-- match) happens in the service, since audience is a jsonb blob evaluated
-- against role/class membership resolved separately.
select *
from announcements
where tenant_id = $1
  and deleted_at is null
  and status = 'published'
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
order by is_pinned desc, published_at desc
limit 200;

-- name: ListActiveTenantIDsForAnnouncements :many
-- cross-module read: tenants is owned by the school module. The scheduled
-- publish job needs the tenant list because announcements is under forced
-- row-level security and can only be read inside a tenant transaction.
select id from tenants where status = 'active';
