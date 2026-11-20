-- One active homeroom teacher per class, enforced in the database as well
-- as in the identity and academic services (identity/service/
-- duty_assignments_admin.go, academic/service/class.go).
--
-- 1. Heal data left by older code, which could keep two active "homeroom"
--    duty assignments for one class (reactivating an ended row did not end
--    the current holder, and each change ended only one previous row):
--    keep the newest holder per class and end the rest today.
with ranked as (
  select da.id,
         row_number() over (
           partition by da.tenant_id, da.academic_year_id, da.duty_type_id, da.scope_class_id
           order by da.starts_on desc, da.created_at desc
         ) as rank
  from duty_assignments da
  join duty_types dt on dt.id = da.duty_type_id
  where dt.slug = 'homeroom' and da.is_active and da.scope_class_id is not null
)
update duty_assignments
set is_active = false, ends_on = coalesce(duty_assignments.ends_on, current_date)
from ranked
where ranked.id = duty_assignments.id and ranked.rank > 1;

-- 2. classes.homeroom_teacher_id names the class's remaining holder, so the
--    class list and the duty list agree again (ending a stray holder used
--    to clear the class even while another holder stayed active).
update classes
set homeroom_teacher_id = da.user_id
from duty_assignments da
join duty_types dt on dt.id = da.duty_type_id
where dt.slug = 'homeroom' and da.is_active and da.scope_class_id = classes.id
  and classes.homeroom_teacher_id is distinct from da.user_id;

-- 3. Refuse a second active homeroom holder for a class. A partial unique
--    index cannot name the duty type's slug, and other class-scoped duty
--    types a school defines may have several holders, so a trigger checks
--    the homeroom duty only. The advisory lock serializes concurrent writes
--    for the same class, so two transactions cannot both pass the check.
create function guard_single_active_homeroom() returns trigger language plpgsql as $$
begin
  if new.is_active and new.scope_class_id is not null
     and exists (select 1 from duty_types dt where dt.id = new.duty_type_id and dt.slug = 'homeroom') then
    perform pg_advisory_xact_lock(hashtextextended(
      'homeroom:' || new.academic_year_id::text || ':' || new.scope_class_id::text, 0));
    if exists (
      select 1 from duty_assignments da
      where da.duty_type_id = new.duty_type_id and da.academic_year_id = new.academic_year_id
        and da.scope_class_id = new.scope_class_id and da.is_active and da.id <> new.id
    ) then
      raise exception 'class already has an active homeroom teacher'
        using errcode = '23505', constraint = 'duty_assignments_single_active_homeroom';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_duty_assignments_single_active_homeroom
  before insert or update of is_active, scope_class_id, duty_type_id, academic_year_id on duty_assignments
  for each row execute function guard_single_active_homeroom();
