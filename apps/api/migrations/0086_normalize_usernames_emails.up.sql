-- Backfill for the username/email normalization the service layer now
-- enforces (lowercase + trim on login and on create/update -- see
-- identity/domain.NormalizeUsername/NormalizeEmail). A row is only
-- lowercased when doing so does not collide with another account in the
-- same tenant under the (tenant_id, username)/(tenant_id, email) unique
-- constraints (migrations/0002_identity.up.sql); a colliding row is left
-- as-is and reported via RAISE NOTICE for an admin to resolve by hand
-- (docs/analysis/backend-inventory.md section 1.1).
do $$
declare
  u record;
  normalized text;
begin
  for u in select id, tenant_id, username from users where username <> lower(trim(username)) loop
    normalized := lower(trim(u.username));
    if exists (
      select 1 from users other
      where other.tenant_id = u.tenant_id and other.username = normalized and other.id <> u.id
    ) then
      raise notice 'normalize_usernames: skipped user % (tenant %): % collides with an existing username', u.id, u.tenant_id, normalized;
    else
      update users set username = normalized where id = u.id;
    end if;
  end loop;

  for u in select id, tenant_id, email from users where email is not null and email <> lower(trim(email)) loop
    normalized := lower(trim(u.email));
    if exists (
      select 1 from users other
      where other.tenant_id = u.tenant_id and other.email = normalized and other.id <> u.id
    ) then
      raise notice 'normalize_usernames: skipped user % (tenant %): email % collides with an existing account', u.id, u.tenant_id, normalized;
    else
      update users set email = normalized where id = u.id;
    end if;
  end loop;
end $$;
