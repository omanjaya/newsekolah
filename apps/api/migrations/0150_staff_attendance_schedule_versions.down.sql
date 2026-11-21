-- Back to one row per weekday (0148's shape): the latest version stays, the
-- history before it is dropped. created_at is the weekday's first version
-- date and working_since the start of its latest unbroken run of working
-- versions, both as local midnight in the school's zone.
alter table staff_attendance_schedules
  add column working_since timestamptz,
  add column updated_at timestamptz,
  add column updated_by uuid references users (id) on delete set null;

with zone as (
  select t.id as tenant_id,
         coalesce((select n.name from pg_timezone_names n where n.name = t.timezone), 'UTC') as name
  from tenants t
),
-- The version each date settles on: the last one saved for it. Save order
-- is the uuidv7 id, from the database's real clock; created_at is not, as
-- a row the up migration carried over keeps the service clock's instant,
-- which a simulated time can put ahead of a later save.
settled as (
  select distinct on (tenant_id, employee_user_id, weekday, effective_from)
    tenant_id, employee_user_id, weekday, effective_from, is_working_day
  from staff_attendance_schedules
  order by tenant_id, employee_user_id, weekday, effective_from, id desc
),
last_off as (
  select tenant_id, employee_user_id, weekday, max(effective_from) as effective_from
  from settled
  where not is_working_day
  group by tenant_id, employee_user_id, weekday
),
dates as (
  select s.tenant_id, s.employee_user_id, s.weekday,
         min(s.effective_from) as first_from,
         min(s.effective_from) filter (
           where s.is_working_day and (o.effective_from is null or s.effective_from > o.effective_from)
         ) as working_from
  from settled s
  left join last_off o using (tenant_id, employee_user_id, weekday)
  group by s.tenant_id, s.employee_user_id, s.weekday
),
latest as (
  select distinct on (tenant_id, employee_user_id, weekday)
    id, tenant_id, employee_user_id, weekday, is_working_day, created_at, created_by
  from staff_attendance_schedules
  order by tenant_id, employee_user_id, weekday, effective_from desc, id desc
)
update staff_attendance_schedules s set
  created_at = d.first_from::timestamp at time zone z.name,
  working_since = case when l.is_working_day then d.working_from::timestamp at time zone z.name end,
  updated_at = l.created_at,
  updated_by = l.created_by
from latest l
join dates d using (tenant_id, employee_user_id, weekday)
join zone z on z.tenant_id = l.tenant_id
where s.id = l.id;

delete from staff_attendance_schedules where updated_at is null;

drop index ix_staff_attendance_schedules_employee;
create index ix_staff_attendance_schedules_employee
  on staff_attendance_schedules (tenant_id, employee_user_id);

alter table staff_attendance_schedules
  drop column effective_from,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  add unique (tenant_id, employee_user_id, weekday),
  add constraint ck_staff_attendance_schedules_working_since
    check (is_working_day = (working_since is not null));

create trigger trg_staff_attendance_schedules_set_updated_at
  before update on staff_attendance_schedules
  for each row execute function set_updated_at();
