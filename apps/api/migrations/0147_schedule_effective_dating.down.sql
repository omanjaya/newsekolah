drop trigger trg_substitution_requests_schedule_in_effect on substitution_requests;
drop trigger trg_attendance_sessions_schedule_in_effect on attendance_sessions;
drop function require_schedule_in_effect();

create or replace function protect_schedule_history() returns trigger language plpgsql as $$
begin
  if row(old.academic_year_id, old.term_id, old.class_id, old.subject_id,
         old.teacher_user_id, old.room_id, old.day_of_week,
         old.start_period_id, old.end_period_id, old.start_seq, old.end_seq)
     is distinct from
     row(new.academic_year_id, new.term_id, new.class_id, new.subject_id,
         new.teacher_user_id, new.room_id, new.day_of_week,
         new.start_period_id, new.end_period_id, new.start_seq, new.end_seq) then
    if exists (select 1 from attendance_sessions a
               where a.schedule_id = old.id and attendance_session_recorded(a.id))
       or exists (select 1 from substitution_requests where schedule_id = old.id) then
      raise exception 'schedule has attendance or substitution history'
        using errcode = '23503', constraint = 'schedule_history_guard';
    end if;
    -- The placeholders copied the old class, teacher and periods.
    delete from attendance_sessions a
    where a.schedule_id = old.id and not attendance_session_recorded(a.id);
  end if;
  return new;
end;
$$;

-- Without effective dates a retired version would be on the timetable for
-- the whole year again, next to the version that replaced it. Retired
-- versions go; one that holds recorded history makes this fail through
-- the RESTRICT foreign keys on purpose: the down migration is lossless
-- only before any effective-dated change was made.
delete from schedules where effective_until is not null;

alter table schedules
  drop constraint ex_schedules_class_slot,
  drop constraint ex_schedules_teacher_slot,
  drop column effective_range,
  drop constraint ck_schedules_effective_range,
  drop column effective_until,
  drop column effective_from;

alter table schedules
  add exclude using gist (
    academic_year_id with =, class_id with =, day_of_week with =, period_range with &&),
  add exclude using gist (
    academic_year_id with =, teacher_user_id with =, day_of_week with =, period_range with &&);
