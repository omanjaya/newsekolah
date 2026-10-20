-- Folds every monthly partition back into the DEFAULT partition so the
-- previous single-partition layout is restored without losing rows.
do $$
declare
  parent text;
  child record;
begin
  foreach parent in array array['audit_logs', 'login_attempts'] loop
    for child in
      select c.relname
      from pg_inherits i
      join pg_class c on c.oid = i.inhrelid
      where i.inhparent = to_regclass(format('public.%I', parent))
        and c.relname ~ ('^' || parent || '_y[0-9]{4}m[0-9]{2}$')
      order by c.relname
    loop
      execute format('alter table %I detach partition %I', parent, child.relname);
      execute format('insert into %I select * from %I', parent || '_default', child.relname);
      execute format('drop table %I', child.relname);
    end loop;
  end loop;
end
$$;
