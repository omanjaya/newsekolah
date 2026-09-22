-- Reverts every tenant_isolation policy to the original cast (see the up
-- migration's comment for why that cast is unsafe against a connection
-- that has ever run a tenant transaction).
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename
    from pg_policies
    where policyname = 'tenant_isolation'
      and permissive = 'PERMISSIVE'
      and cmd = 'ALL'
  loop
    execute format(
      'alter policy tenant_isolation on %I.%I using (tenant_id = current_setting(%L, true)::uuid) with check (tenant_id = current_setting(%L, true)::uuid)',
      pol.schemaname, pol.tablename, 'app.tenant_id', 'app.tenant_id'
    );
  end loop;
end
$$;
