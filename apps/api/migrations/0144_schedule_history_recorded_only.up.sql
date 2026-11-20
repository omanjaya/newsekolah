-- Only a lesson something was recorded for is schedule history. Listing a
-- teacher's day used to open a session row for every lesson on the date it
-- showed, so browsing a day froze its timetable blocks through the 0107
-- guard although nothing was ever taken. A session nobody submitted, wrote
-- an entry in or attached a journal to is a placeholder: it neither counts
-- as history nor blocks a change, and it is cleared with the schedule it
-- copied (the next open recreates it from the edited row).
create function attendance_session_recorded(uuid) returns boolean
language sql stable as $$
  select exists (select 1 from attendance_sessions a where a.id = $1 and a.submitted_at is not null)
      or exists (select 1 from attendance_entries e where e.session_id = $1)
      or exists (select 1 from class_journals j where j.attendance_session_id = $1);
$$;

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

-- The ON DELETE RESTRICT foreign key from 0107 still refuses a schedule
-- with a recorded session; its placeholders go first.
create function clear_schedule_placeholder_sessions() returns trigger language plpgsql as $$
begin
  delete from attendance_sessions a
  where a.schedule_id = old.id and not attendance_session_recorded(a.id);
  return old;
end;
$$;

create trigger trg_schedule_clear_placeholder_sessions before delete on schedules
  for each row execute function clear_schedule_placeholder_sessions();
