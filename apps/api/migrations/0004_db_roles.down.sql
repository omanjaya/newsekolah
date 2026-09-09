do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_rw') then
    alter default privileges in schema public revoke select, insert, update, delete on tables from app_rw;
    alter default privileges in schema public revoke usage, select on sequences from app_rw;
    revoke all on all tables in schema public from app_rw;
    revoke all on all sequences in schema public from app_rw;
    revoke usage on schema public from app_rw;
    drop role app_rw;
  end if;
  if exists (select 1 from pg_roles where rolname = 'app_platform') then
    alter default privileges in schema public revoke select, insert, update, delete on tables from app_platform;
    alter default privileges in schema public revoke usage, select on sequences from app_platform;
    revoke all on all tables in schema public from app_platform;
    revoke all on all sequences in schema public from app_platform;
    revoke usage on schema public from app_platform;
    drop role app_platform;
  end if;
exception
  when insufficient_privilege then
    raise notice 'skipping app_rw/app_platform drop: insufficient privilege';
end
$$;
