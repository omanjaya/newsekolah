-- ensure_notifications_partition (migration 0052) runs DDL
-- (`create table ... partition of notifications ...`) to create each
-- month's partition ahead of traffic. It was created without SECURITY
-- DEFINER, so it runs as whatever role calls it. app_rw (the
-- least-privilege runtime role, migration 0004) only holds
-- SELECT/INSERT/UPDATE/DELETE on tables plus USAGE on schema public --
-- never CREATE -- so the "notifications.ensure_partitions" periodic River
-- job (internal/modules/notifications/transport/jobs) fails outright
-- under app_rw the first time a new month needs its partition, silently
-- falling back to notifications_default absorbing that month's rows
-- (migration 0052's own comment on why that default partition exists)
-- until the failure is noticed.
--
-- Fix: make the function SECURITY DEFINER so it always runs with its
-- owner's (the migration role's, which retains CREATEDB/CREATEROLE-level
-- schema privileges) rights regardless of caller, with search_path locked
-- to prevent the classic search_path-hijack risk that comes with
-- SECURITY DEFINER.
alter function ensure_notifications_partition(date) security definer;
alter function ensure_notifications_partition(date) set search_path = public, pg_temp;
