-- Product decision (owner, 25 Sep 2026): parent ("orang tua") user accounts
-- and every parent-facing feature are removed from the product. Guardian
-- CONTACT data (student_profiles.guardian_name/guardian_phone/father_name/
-- mother_name/parent_occupation, used by warning letters, leave letters and
-- WhatsApp messages) is untouched -- only the parent LOGIN ACCOUNT, the
-- parent<->student account link, and features that exist for a logged-in
-- parent go. See docs/15-paritas-sion.md and
-- docs/analysis/remove-parent-role-2026-09-25.md.

-- 1. A user whose only profile is a parent profile is disabled (status
-- inactive, never hard-deleted) and every one of their sessions is
-- revoked, before the parent profile kind stops being valid below. The
-- live deployment has none of these; this covers any other install that
-- does.
update users
set status = 'inactive'
where status <> 'inactive'
  and id in (select user_id from user_profiles where kind = 'parent');

update sessions
set revoked_at = coalesce(revoked_at, now()),
    revoked_reason = coalesce(revoked_reason, 'parent_role_removed')
where revoked_at is null
  and user_id in (select user_id from user_profiles where kind = 'parent');

-- The parent profile row itself carries no data anything else still reads
-- (unlike student_profiles' guardian_name/guardian_phone, which lives on
-- the STUDENT's own profile, not the parent's) and the check constraint
-- below drops 'parent' as a valid kind, so these rows cannot remain.
delete from user_profiles where kind = 'parent';

-- 2. The parent<->student account link table. Nothing else references it
-- (guardian contact data lives on student_profiles, not here), so it is
-- safe to drop outright; the down migration recreates it empty.
drop table if exists parent_students;

-- 3. user_profiles.kind no longer accepts 'parent'.
alter table user_profiles drop constraint user_profiles_kind_check;
alter table user_profiles add constraint user_profiles_kind_check
  check (kind in ('student', 'teacher', 'staff'));

-- 4. The parent system role, in every tenant. role_permissions and
-- user_roles cascade on roles.id delete (migration 0002), matching
-- 0117_principal_role.up.sql's pattern for removing a system role.
delete from roles where slug = 'parent' and is_system = true;

-- 5. Parent-only permission codes. role_permissions/duty_permissions
-- cascade on permissions.code delete; by this point no role_permissions
-- row can still reference them (the only role that ever granted them,
-- 'parent', is already gone), and no duty ever granted them either, but
-- the cascade is harmless if some install's data disagrees.
delete from permissions
where code in ('view_child_attendance', 'view_child_grades', 'approve_child_leave_requests', 'view_child_billing');

-- 6. leave_requests.parent_approved_at: dead column, never written by any
-- query (grep confirms only ever selected, never set) -- the parent
-- approval stage that would have set it is removed in step 7 below.
alter table leave_requests drop column if exists parent_approved_at;

-- 7. Advance any leave-request (or other permits workflow) instance
-- currently waiting on a 'guardian_of_student' stage to the stage that
-- follows it (or complete the instance, if it was the last stage), and
-- strip that stage out of the stored workflow_definitions row it belongs
-- to. The rule was opt-in (never part of domain.DefaultStages), so this
-- only touches a tenant that had actually added it via ReplaceDefinition;
-- the live deployment has none, but another install might.
do $$
declare
  def record;
  guardian_index int;
  guardian_key text;
  new_stages jsonb;
  new_len int;
begin
  for def in
    select id, stages
    from workflow_definitions
    where exists (
      select 1 from jsonb_array_elements(stages) s
      where s ->> 'approver_rule' = 'guardian_of_student'
    )
  loop
    select (elem.ord - 1), elem.value ->> 'key'
      into guardian_index, guardian_key
    from jsonb_array_elements(def.stages) with ordinality as elem(value, ord)
    where elem.value ->> 'approver_rule' = 'guardian_of_student'
    limit 1;

    new_stages := def.stages - guardian_index;
    new_len := jsonb_array_length(new_stages);

    if new_len <= guardian_index then
      -- The removed stage was last: nothing left to wait on, so the
      -- instance is done.
      with updated as (
        update workflow_instances
        set status = 'completed',
            closed_at = coalesce(closed_at, now())
        where definition_id = def.id
          and status = 'in_progress'
          and current_stage_index = guardian_index
        returning tenant_id, id
      )
      insert into workflow_events (tenant_id, instance_id, stage_key, from_status, to_status, verification, note)
      select tenant_id, id, guardian_key, 'in_progress', 'completed', 'auto',
             'Auto-completed: guardian/parent approval stage removed with parent accounts'
      from updated;
    else
      -- The stage that used to follow the removed one now sits at the
      -- same array index, so an instance waiting at guardian_index just
      -- keeps pointing at that index.
      with updated as (
        update workflow_instances
        set current_stage_index = guardian_index
        where definition_id = def.id
          and status = 'in_progress'
          and current_stage_index = guardian_index
        returning tenant_id, id
      )
      insert into workflow_events (tenant_id, instance_id, stage_key, from_status, to_status, verification, note)
      select tenant_id, id, guardian_key, 'in_progress', 'in_progress', 'auto',
             'Auto-advanced past removed guardian/parent approval stage (parent accounts removed)'
      from updated;
    end if;

    -- Every later stage shifts down one index in the trimmed array.
    update workflow_instances
    set current_stage_index = current_stage_index - 1
    where definition_id = def.id
      and status = 'in_progress'
      and current_stage_index > guardian_index;

    update workflow_definitions set stages = new_stages where id = def.id;
  end loop;
end
$$;
