-- Optional: creates the least-privilege runtime roles described in
-- docs/06-database-schema.md section 1. Skipped (not failed) when the
-- connected migration role cannot create roles, e.g. a managed Postgres
-- (RDS, Cloud SQL) where CREATEROLE is reserved for the provider's admin
-- role. In that case, provision app_rw / app_platform out of band and point
-- the runtime DATABASE_URL at app_rw instead of the migration superuser.
--
-- IMPORTANT: a superuser connection always bypasses row level security,
-- FORCE ROW LEVEL SECURITY notwithstanding (see PostgreSQL docs on RLS).
-- The dev docker-compose Postgres user is the initdb superuser for
-- convenience; RLS is only actually enforced when the application connects
-- as a non-superuser, non-BYPASSRLS role such as app_rw.
do $$
begin
  if not (select rolcreaterole or rolsuper from pg_roles where rolname = current_user) then
    raise notice 'skipping app_rw/app_platform creation: % cannot create roles', current_user;
    return;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'app_rw') then
    create role app_rw with login nosuperuser nocreatedb nocreaterole nobypassrls password 'change-me-in-production';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'app_platform') then
    create role app_platform with login nosuperuser nocreatedb nocreaterole nobypassrls password 'change-me-in-production';
  end if;

  grant usage on schema public to app_rw, app_platform;
  grant select, insert, update, delete on all tables in schema public to app_rw, app_platform;
  grant usage, select on all sequences in schema public to app_rw, app_platform;
  alter default privileges in schema public grant select, insert, update, delete on tables to app_rw, app_platform;
  alter default privileges in schema public grant usage, select on sequences to app_rw, app_platform;
end
$$;
