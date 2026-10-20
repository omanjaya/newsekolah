-- Access path for the webhook delivery retention job
-- (platform.run_retention): delete finished deliveries older than the
-- cutoff, one tenant at a time. The existing
-- (tenant_id, endpoint_id, created_at desc) index cannot serve a filter on
-- tenant and age alone. Plain CREATE INDEX: golang-migrate runs each file in
-- one batch, which cannot contain CREATE INDEX CONCURRENTLY.
create index ix_integration_webhook_deliveries_tenant_created
  on integration_webhook_deliveries (tenant_id, created_at);
