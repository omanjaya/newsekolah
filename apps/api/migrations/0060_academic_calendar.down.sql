drop table if exists academic_calendar_event_grade_levels;

alter table academic_calendar_events
  drop constraint academic_calendar_events_kind_check;

alter table academic_calendar_events
  add constraint academic_calendar_events_kind_check
  check (kind in ('holiday', 'exam', 'event', 'no_school'));

alter table academic_calendar_events
  drop constraint academic_calendar_events_range_check,
  drop column end_date;
