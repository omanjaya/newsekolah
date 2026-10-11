-- Monthly partition management for audit_logs and login_attempts
-- (docs/analysis/audit-skalabilitas-2026-10-10.md section 5, finding 1).
-- Both tables were created with only a DEFAULT partition, so every row of
-- every tenant piled into one ever-growing table that could not be trimmed
-- without a long DELETE. These functions mirror ensure_notifications_partition
-- (0052) with three differences:
--
--   1. Bounds are UTC midnights. The older function formats a bare date, which
--      Postgres reads in the session TimeZone; here the partition boundary and
--      the Go job (which names months in UTC) can never disagree.
--   2. If the DEFAULT partition already holds rows for the month, Postgres
--      refuses to create an overlapping partition. The function moves those
--      rows into the new partition inside the same transaction (build a
--      standalone table, move the rows, then ATTACH it), so history is never
--      lost and never left behind.
--   3. SECURITY DEFINER with a pinned search_path and an allow-list of table
--      names: the runtime role (app_rw) does not own the tables, so it could
--      not run this DDL itself, and it must not be able to use these
--      functions on any other table.
--
-- drop_expired_monthly_partitions is the retention primitive: dropping a whole
-- month is O(1) where a DELETE of the same rows would bloat the table.

create or replace function ensure_monthly_partition(parent_table text, target_month date) returns text
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '10s'
as $$
declare
  month_start timestamptz := (date_trunc('month', target_month)::date)::timestamp at time zone 'UTC';
  month_end timestamptz := ((date_trunc('month', target_month) + interval '1 month')::date)::timestamp at time zone 'UTC';
  partition_name text := parent_table || '_y' || to_char(month_start at time zone 'UTC', 'YYYY') || 'm' || to_char(month_start at time zone 'UTC', 'MM');
  default_name text := parent_table || '_default';
  has_rows boolean;
begin
  if parent_table not in ('audit_logs', 'login_attempts') then
    raise exception 'ensure_monthly_partition: % is not a managed table', parent_table;
  end if;

  if to_regclass(format('public.%I', partition_name)) is not null then
    return partition_name;
  end if;

  execute format(
    'select exists (select 1 from %I where occurred_at >= %L and occurred_at < %L)',
    default_name, month_start, month_end
  ) into has_rows;

  if not has_rows then
    execute format(
      'create table %I partition of %I for values from (%L) to (%L)',
      partition_name, parent_table, month_start, month_end
    );
    return partition_name;
  end if;

  -- Rows for this month sit in the DEFAULT partition. Block writers to it for
  -- the few statements below so no new row can slip into the month between
  -- the move and the ATTACH (which re-validates the DEFAULT partition and
  -- would otherwise fail).
  execute format('lock table %I in share row exclusive mode', default_name);
  execute format(
    'create table %I (like %I including defaults including constraints including indexes)',
    partition_name, parent_table
  );
  execute format(
    'with moved as (delete from %I where occurred_at >= %L and occurred_at < %L returning *) insert into %I select * from moved',
    default_name, month_start, month_end, partition_name
  );
  execute format(
    'alter table %I attach partition %I for values from (%L) to (%L)',
    parent_table, partition_name, month_start, month_end
  );
  return partition_name;
end
$$;

-- drop_expired_monthly_partitions drops every monthly partition of
-- parent_table whose whole month ends at or before cutoff, and returns the
-- dropped partition names. The DEFAULT partition and any partition whose name
-- does not match <parent>_yYYYYmMM are never touched.
create or replace function drop_expired_monthly_partitions(parent_table text, cutoff timestamptz) returns setof text
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '10s'
as $$
declare
  child record;
  child_start timestamptz;
  child_end timestamptz;
begin
  if parent_table not in ('audit_logs', 'login_attempts') then
    raise exception 'drop_expired_monthly_partitions: % is not a managed table', parent_table;
  end if;
  -- audit_logs is an accountability record: even a misconfigured caller must
  -- not be able to purge the most recent six months.
  if parent_table = 'audit_logs' and cutoff > now() - interval '6 months' then
    raise exception 'drop_expired_monthly_partitions: audit_logs cutoff % is inside the protected 6 month window', cutoff;
  end if;

  for child in
    select c.relname
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    where i.inhparent = to_regclass(format('public.%I', parent_table))
      and c.relname ~ ('^' || parent_table || '_y[0-9]{4}m[0-9]{2}$')
    order by c.relname
  loop
    child_start := make_date(
      substring(child.relname from '_y([0-9]{4})m')::int,
      substring(child.relname from 'm([0-9]{2})$')::int,
      1
    )::timestamp at time zone 'UTC';
    child_end := ((child_start at time zone 'UTC') + interval '1 month') at time zone 'UTC';
    if child_end <= cutoff then
      execute format('drop table %I', child.relname);
      return next child.relname;
    end if;
  end loop;
end
$$;

-- The functions are DDL with owner privileges: only the runtime roles (when
-- they exist) may call them, never PUBLIC.
revoke all on function ensure_monthly_partition(text, date) from public;
revoke all on function drop_expired_monthly_partitions(text, timestamptz) from public;

do $$
declare
  runtime_role text;
begin
  foreach runtime_role in array array['app_rw', 'app_platform'] loop
    if exists (select 1 from pg_roles where rolname = runtime_role) then
      execute format('grant execute on function ensure_monthly_partition(text, date) to %I', runtime_role);
      execute format('grant execute on function drop_expired_monthly_partitions(text, timestamptz) to %I', runtime_role);
    end if;
  end loop;
end
$$;
