-- Extend academic_calendar_events with a date range and widen its kind
-- vocabulary to include semester breaks, and let an event target specific
-- grade levels instead of always applying school-wide.

alter table academic_calendar_events
  add column end_date date;

update academic_calendar_events set end_date = date where end_date is null;

alter table academic_calendar_events
  alter column end_date set not null,
  add constraint academic_calendar_events_range_check check (end_date >= date);

alter table academic_calendar_events
  drop constraint academic_calendar_events_kind_check;

alter table academic_calendar_events
  add constraint academic_calendar_events_kind_check
  check (kind in ('holiday', 'exam', 'event', 'no_school', 'semester_break'));

create table academic_calendar_event_grade_levels (
  tenant_id uuid not null references tenants (id) on delete cascade,
  calendar_event_id uuid not null references academic_calendar_events (id) on delete cascade,
  grade_level_id uuid not null references grade_levels (id) on delete cascade,
  primary key (calendar_event_id, grade_level_id)
);

create index ix_academic_calendar_event_grade_levels_tenant_id on academic_calendar_event_grade_levels (tenant_id);
create index ix_academic_calendar_event_grade_levels_event_id on academic_calendar_event_grade_levels (calendar_event_id);
create index ix_academic_calendar_event_grade_levels_grade_level_id on academic_calendar_event_grade_levels (grade_level_id);

alter table academic_calendar_event_grade_levels enable row level security;
alter table academic_calendar_event_grade_levels force row level security;

create policy tenant_isolation on academic_calendar_event_grade_levels
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
