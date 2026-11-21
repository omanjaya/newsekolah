-- Staff work schedules become an append-only history of weekday versions.
-- A row used to hold only a weekday's current state, and a day with no
-- stored record is judged again on every read, so turning a working
-- weekday off rewrote its earlier days into days off: an absence silently
-- left the recap. 0148's working_since dated the switch to a working day
-- only, and only the latest one.
--
-- Each row is now one version of a weekday. It applies from
-- effective_from, the school-local date it was saved on, until the next
-- version of the same weekday; of two versions saved on the same date the
-- later save wins for that date. A save appends a version only for the
-- weekdays it changes and never rewrites one, so every past date is judged
-- by the version in effect then, the way the effective-dated timetable
-- (0147) keeps lessons. Before a weekday's first version the employee has
-- no schedule for it (unscheduled).
--
-- The school-local date uses the tenant's zone; an unknown zone name falls
-- back to UTC, as platform/clock.Location does.

do $$
declare c record;
begin
  -- One row per weekday no longer holds. The constraint was declared
  -- without a name in 0070, so it is dropped by lookup.
  for c in select conname from pg_constraint
           where conrelid = 'staff_attendance_schedules'::regclass and contype = 'u' loop
    execute format('alter table staff_attendance_schedules drop constraint %I', c.conname);
  end loop;
end $$;

drop trigger trg_staff_attendance_schedules_set_updated_at on staff_attendance_schedules;

alter table staff_attendance_schedules add column effective_from date;

-- A weekday that became a working day after its first save was a day off
-- from that save until then: that period gets a version of its own.
with zone as (
  select t.id as tenant_id,
         coalesce((select n.name from pg_timezone_names n where n.name = t.timezone), 'UTC') as name
  from tenants t
)
insert into staff_attendance_schedules (
  tenant_id, employee_user_id, weekday, is_working_day, start_minute, end_minute, grace_minutes,
  created_at, created_by, effective_from
)
select s.tenant_id, s.employee_user_id, s.weekday, false, s.start_minute, s.end_minute, s.grace_minutes,
       s.created_at, s.created_by, (s.created_at at time zone z.name)::date
from staff_attendance_schedules s
join zone z on z.tenant_id = s.tenant_id
where s.working_since is not null
  and (s.working_since at time zone z.name)::date > (s.created_at at time zone z.name)::date;

-- The stored state is the version in effect since it was last switched:
-- a working day since working_since, a day off since the first save. When
-- a day off was a working day before, that period is not on record.
with zone as (
  select t.id as tenant_id,
         coalesce((select n.name from pg_timezone_names n where n.name = t.timezone), 'UTC') as name
  from tenants t
)
update staff_attendance_schedules s set
  created_at = coalesce(s.working_since, s.created_at),
  effective_from = (coalesce(s.working_since, s.created_at) at time zone z.name)::date
from zone z
where z.tenant_id = s.tenant_id and s.effective_from is null;

alter table staff_attendance_schedules
  drop constraint ck_staff_attendance_schedules_working_since,
  drop column working_since,
  drop column updated_at,
  drop column updated_by,
  alter column effective_from set not null;

drop index ix_staff_attendance_schedules_employee;
create index ix_staff_attendance_schedules_employee
  on staff_attendance_schedules (tenant_id, employee_user_id, weekday, effective_from);
