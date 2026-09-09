-- name: ListAuditLogs :many
-- Ordered by id descending: audit_logs.id is a uuidv7 (time-sortable), so
-- this gives newest-first without needing a second sort key even though
-- the table's primary key is (id, occurred_at) for partitioning.
select *
from audit_logs
where tenant_id = sqlc.arg(tenant_id)
  and (sqlc.narg(actor_user_id)::uuid is null or actor_user_id = sqlc.narg(actor_user_id))
  and (sqlc.narg(entity_type)::text is null or entity_type = sqlc.narg(entity_type))
  and (sqlc.narg(entity_id)::uuid is null or entity_id = sqlc.narg(entity_id))
  and (sqlc.narg(from_date)::timestamptz is null or occurred_at >= sqlc.narg(from_date))
  and (sqlc.narg(to_date)::timestamptz is null or occurred_at <= sqlc.narg(to_date))
  and (sqlc.narg(cursor_id)::uuid is null or id < sqlc.narg(cursor_id))
order by id desc
limit sqlc.arg(page_limit);
