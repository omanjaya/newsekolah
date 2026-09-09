-- Partitioned by created_at (monthly) per docs/06-database-schema.md section 10:
-- "partisi bulanan; retensi 180 hari". A DEFAULT partition catches any row
-- outside the explicitly created ranges (e.g. a month nobody pre-created
-- yet) so inserts never fail; ensure_notifications_partition() below is what
-- keeps the default partition from silently absorbing normal traffic.
create table notifications (
  id uuid not null default uuidv7(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null,
  kind text not null,
  title text not null check (length(title) <= 200),
  body text not null check (length(body) <= 2000),
  href text,
  data jsonb not null default '{}'::jsonb,
  announcement_id uuid references announcements (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);

create table notifications_default partition of notifications default;

create index ix_notifications_tenant_id on notifications (tenant_id);
create index ix_notifications_user_read_created on notifications (user_id, read_at, created_at desc);
create index ix_notifications_announcement_id on notifications (announcement_id);

alter table notifications enable row level security;
alter table notifications force row level security;

create policy tenant_isolation on notifications
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ensure_notifications_partition creates the monthly partition covering
-- target_month (any date within the month) if it does not already exist.
-- Called at migration time for the current and next two months, and by the
-- "notifications.ensure_partitions" periodic River job thereafter so a
-- partition always exists ahead of the traffic that needs it.
create or replace function ensure_notifications_partition(target_month date) returns void
language plpgsql as $$
declare
  partition_start date := date_trunc('month', target_month)::date;
  partition_end date := (date_trunc('month', target_month) + interval '1 month')::date;
  partition_name text := 'notifications_y' || to_char(partition_start, 'YYYY') || 'm' || to_char(partition_start, 'MM');
begin
  if not exists (select 1 from pg_class where relname = partition_name) then
    execute format(
      'create table %I partition of notifications for values from (%L) to (%L)',
      partition_name, partition_start, partition_end
    );
  end if;
end
$$;

select ensure_notifications_partition(current_date);
select ensure_notifications_partition((current_date + interval '1 month')::date);
select ensure_notifications_partition((current_date + interval '2 months')::date);
