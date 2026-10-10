-- name: PlatformEnsureMonthlyPartition :one
-- Schema-level DDL helper (migrations/0123). Not tenant-scoped, runs outside
-- any tenant transaction.
select ensure_monthly_partition(sqlc.arg(parent_table)::text, sqlc.arg(target_month)::date) as partition_name;

-- name: PlatformDropExpiredPartitions :many
select drop_expired_monthly_partitions(sqlc.arg(parent_table)::text, sqlc.arg(cutoff)::timestamptz) as partition_name;

-- name: PlatformListRetentionTenantIDs :many
-- Every tenant that can still hold data: retention applies to suspended and
-- offboarding schools too, only deleted ones are gone.
select id from tenants where status <> 'deleted' order by id;

-- name: PlatformDeleteLoginAttemptsBefore :execrows
-- cross-module write: login_attempts is owned by identity. Deletes at most
-- sqlc.arg(batch_size) rows so a large backlog never holds one long
-- transaction; the caller loops until fewer rows than the batch are deleted.
delete from login_attempts
where (id, occurred_at) in (
  select la.id, la.occurred_at from login_attempts la
  where la.tenant_id = sqlc.arg(tenant_id) and la.occurred_at < sqlc.arg(cutoff)
  limit sqlc.arg(batch_size)
);

-- name: PlatformDeleteWebhookDeliveriesBefore :execrows
-- cross-module write: integration_webhook_deliveries is owned by
-- integrations. Pending deliveries are never deleted: they are still owed an
-- attempt, however old.
delete from integration_webhook_deliveries
where id in (
  select d.id from integration_webhook_deliveries d
  where d.tenant_id = sqlc.arg(tenant_id) and d.created_at < sqlc.arg(cutoff) and d.status <> 'pending'
  limit sqlc.arg(batch_size)
);
