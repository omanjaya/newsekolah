-- Every tenant_isolation RLS policy (137 tables, one USING + one WITH
-- CHECK clause each = 274 occurrences) casts the session GUC straight to
-- uuid: `tenant_id = current_setting('app.tenant_id', true)::uuid`. That
-- cast is only safe while the GUC is genuinely unset, in which case
-- current_setting(name, true) returns NULL and the comparison is simply
-- unknown (0 rows, no error).
--
-- Postgres does not keep custom ("placeholder") GUCs unset once they have
-- been touched: the first `SET LOCAL app.tenant_id = ...` (what
-- database.WithTenantTx issues) permanently defines the placeholder for
-- the rest of that session/connection. When the transaction ends, SET
-- LOCAL's automatic revert restores the GUC to its pre-transaction value
-- -- which, the first time, is the placeholder's baseline of '' (empty
-- string), not NULL. From then on current_setting('app.tenant_id', true)
-- returns '' instead of NULL on that connection for the rest of its
-- lifetime, including every future request that reuses it from the pool
-- and runs a query outside another WithTenantTx (pre-auth/public reads:
-- tenant lookup by domain, OPAC, branding query helpers that happen to
-- touch an RLS table, etc.). Casting '' to ::uuid raises
-- invalid_text_representation (22P02) instead of yielding "no tenant
-- context, so no rows", turning those reads into 500s as soon as their
-- pooled connection has served one authenticated request -- effectively
-- always, in production.
--
-- Fix: wrap the cast in NULLIF so an empty string is treated exactly like
-- an unset GUC (NULL), which the comparison already handles safely.
--
-- All 137 tenant_isolation policies share the identical expression (see
-- apps/api/README.md's RLS section and docs/08-security.md section 4), so
-- this rewrites every one of them generically via pg_policies rather than
-- hand-listing 137 ALTER POLICY statements.
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
      and qual = '(tenant_id = (current_setting(''app.tenant_id''::text, true))::uuid)'
      and with_check = '(tenant_id = (current_setting(''app.tenant_id''::text, true))::uuid)'
  loop
    execute format(
      'alter policy tenant_isolation on %I.%I using (tenant_id = nullif(current_setting(%L, true), '''')::uuid) with check (tenant_id = nullif(current_setting(%L, true), '''')::uuid)',
      pol.schemaname, pol.tablename, 'app.tenant_id', 'app.tenant_id'
    );
  end loop;

  -- Sanity check: every one of the 137 known tenant_isolation policies
  -- must have matched and been rewritten. If schema drift changed the
  -- expression's deparsed form, fail loudly rather than silently leaving
  -- some policies on the crash-prone cast.
  if (select count(*) from pg_policies where policyname = 'tenant_isolation') <> 137 then
    raise exception 'expected 137 tenant_isolation policies, found %; update this migration''s expected count', (select count(*) from pg_policies where policyname = 'tenant_isolation');
  end if;
  if exists (
    select 1 from pg_policies
    where policyname = 'tenant_isolation'
      and qual = '(tenant_id = (current_setting(''app.tenant_id''::text, true))::uuid)'
  ) then
    raise exception 'one or more tenant_isolation policies still use the null-unsafe cast after this migration ran';
  end if;
end
$$;
