-- Gives audit_logs and login_attempts their monthly partitions.
--
-- Strategy (chosen for safety over speed): rows already in the DEFAULT
-- partition are MOVED into per-month partitions by ensure_monthly_partition
-- (0123), one month at a time, inside this migration's transaction. Either
-- everything moves or nothing does; no row is ever deleted or left
-- unreachable. The alternative of creating only future partitions and
-- leaving history in DEFAULT was rejected: history in DEFAULT can only be
-- trimmed by DELETE, so the retention jobs could never drop it cheaply and
-- the unbounded table the audit warned about would stay.
--
-- Cost: the move rewrites the rows that exist today, with writers to the
-- DEFAULT partition blocked while each month is moved. For very large audit
-- tables (tens of millions of rows) run this during a quiet window.
--
-- After this migration the DEFAULT partitions are empty and only catch rows
-- whose month has no partition yet; the daily job keeps the current and next
-- two months created so that does not happen.

do $$
declare
  parent text;
  m record;
begin
  foreach parent in array array['audit_logs', 'login_attempts'] loop
    for m in execute format(
      'select distinct date_trunc(''month'', occurred_at at time zone ''UTC'')::date as month from %I order by 1',
      parent || '_default'
    ) loop
      perform ensure_monthly_partition(parent, m.month);
    end loop;

    perform ensure_monthly_partition(parent, ((now() at time zone 'UTC')::date + (n || ' months')::interval)::date)
    from generate_series(0, 2) as n;
  end loop;
end
$$;
