-- One active homeroom teacher per class, and one homeroom class per
-- teacher, enforced in the database as well as in the identity and
-- academic services (identity/service/duty_assignments_admin.go,
-- academic/service/class.go).
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

-- 2. Older code also let one teacher hold the homeroom duty of several
--    classes in a year, while attendance, permits and the homeroom page
--    each reach only one of them. Keep the teacher's newest class and end
--    the rest today; a class whose holder is ended this way no longer has
--    a homeroom teacher, so its classes.homeroom_teacher_id is cleared.
with ranked as (
  select da.id,
         row_number() over (
           partition by da.tenant_id, da.academic_year_id, da.duty_type_id, da.user_id
           order by da.starts_on desc, da.created_at desc
         ) as rank
  from duty_assignments da
  join duty_types dt on dt.id = da.duty_type_id
  where dt.slug = 'homeroom' and da.is_active and da.scope_class_id is not null
),
ended as (
  update duty_assignments
  set is_active = false, ends_on = coalesce(duty_assignments.ends_on, current_date)
  from ranked
  where ranked.id = duty_assignments.id and ranked.rank > 1
  returning duty_assignments.scope_class_id, duty_assignments.user_id
)
update classes
set homeroom_teacher_id = null
from ended
where classes.id = ended.scope_class_id and classes.homeroom_teacher_id = ended.user_id;

-- 3. classes.homeroom_teacher_id names the class's remaining holder, so the
--    class list and the duty list agree again (ending a stray holder used
--    to clear the class even while another holder stayed active).
update classes
set homeroom_teacher_id = da.user_id
from duty_assignments da
join duty_types dt on dt.id = da.duty_type_id
where dt.slug = 'homeroom' and da.is_active and da.scope_class_id = classes.id
  and classes.homeroom_teacher_id is distinct from da.user_id;

-- 4. Refuse a second active homeroom holder for a class, and a second
--    active homeroom class for a teacher. A partial unique index cannot
--    name the duty type's slug, and other class-scoped duty types a school
--    defines may have several holders, so a trigger checks the homeroom
--    duty only. One advisory lock per academic year serializes concurrent
--    homeroom writes (rare, admin-only), so two transactions cannot both
--    pass either check, and the two checks cannot deadlock each other.
create function guard_single_active_homeroom() returns trigger language plpgsql as $$
begin
  if new.is_active and new.scope_class_id is not null
     and exists (select 1 from duty_types dt where dt.id = new.duty_type_id and dt.slug = 'homeroom') then
    perform pg_advisory_xact_lock(hashtextextended('homeroom:' || new.academic_year_id::text, 0));
    if exists (
      select 1 from duty_assignments da
      where da.duty_type_id = new.duty_type_id and da.academic_year_id = new.academic_year_id
        and da.scope_class_id = new.scope_class_id and da.is_active and da.id <> new.id
    ) then
      raise exception 'class already has an active homeroom teacher'
        using errcode = '23505', constraint = 'duty_assignments_single_active_homeroom';
    end if;
    if exists (
      select 1 from duty_assignments da
      where da.duty_type_id = new.duty_type_id and da.academic_year_id = new.academic_year_id
        and da.user_id = new.user_id and da.scope_class_id is not null
        and da.is_active and da.id <> new.id
    ) then
      raise exception 'teacher is already homeroom teacher of another class'
        using errcode = '23505', constraint = 'duty_assignments_single_homeroom_per_teacher';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_duty_assignments_single_active_homeroom
  before insert or update of is_active, scope_class_id, duty_type_id, academic_year_id, user_id on duty_assignments
  for each row execute function guard_single_active_homeroom();
