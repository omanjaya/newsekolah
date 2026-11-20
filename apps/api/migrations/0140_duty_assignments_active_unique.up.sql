-- One active assignment per person, duty and scope in an academic year.
--
-- The table's original unique (academic_year_id, duty_type_id, user_id,
-- scope_class_id, scope_student_id) never matched anything: every row has
-- at least one of the two scope columns null, and Postgres treats nulls as
-- distinct, so a double submit of "Beri tugas" for a school-wide duty such
-- as Guru Piket saved the same assignment twice. It also covered ended
-- rows, which would have stopped re-assigning a duty after it ended had it
-- ever matched.
--
-- 1. End the duplicates already saved, keeping the oldest row of each key
--    (ids are UUIDv7, so the smallest id is the oldest). A duplicate ends
--    on its own start date, so it grants nothing (ended rows are inactive)
--    and its history stays readable.
update duty_assignments a
set is_active = false, ends_on = coalesce(a.ends_on, a.starts_on)
from duty_assignments b
where a.tenant_id = b.tenant_id
  and a.academic_year_id = b.academic_year_id
  and a.duty_type_id = b.duty_type_id
  and a.user_id = b.user_id
  and a.scope_class_id is not distinct from b.scope_class_id
  and a.scope_student_id is not distinct from b.scope_student_id
  and a.is_active and b.is_active
  and a.id > b.id;

-- 2. Replace the dead constraint with a partial unique index over active
--    rows only. NULLS NOT DISTINCT makes two school-wide rows (both scope
--    columns null) a duplicate; it needs Postgres 15+, and every compose
--    file runs 16. The old constraint's name was generated (and truncated)
--    by Postgres, so it is looked up rather than spelled out; it is the
--    table's only unique constraint.
do $$
declare
  name text;
begin
  for name in
    select conname from pg_constraint
    where conrelid = 'duty_assignments'::regclass and contype = 'u'
  loop
    execute format('alter table duty_assignments drop constraint %I', name);
  end loop;
end;
$$;

create unique index ux_duty_assignments_active
  on duty_assignments (tenant_id, academic_year_id, duty_type_id, user_id, scope_class_id, scope_student_id)
  nulls not distinct
  where is_active;
