drop trigger trg_schedule_clear_placeholder_sessions on schedules;
drop function clear_schedule_placeholder_sessions();

create or replace function protect_schedule_history() returns trigger language plpgsql as $$
begin
  if row(old.academic_year_id, old.term_id, old.class_id, old.subject_id,
         old.teacher_user_id, old.room_id, old.day_of_week,
         old.start_period_id, old.end_period_id, old.start_seq, old.end_seq)
     is distinct from
     row(new.academic_year_id, new.term_id, new.class_id, new.subject_id,
         new.teacher_user_id, new.room_id, new.day_of_week,
         new.start_period_id, new.end_period_id, new.start_seq, new.end_seq)
     and (exists (select 1 from attendance_sessions where schedule_id = old.id)
          or exists (select 1 from substitution_requests where schedule_id = old.id)) then
    raise exception 'schedule has attendance or substitution history'
      using errcode = '23503', constraint = 'schedule_history_guard';
  end if;
  return new;
end;
$$;

drop function attendance_session_recorded(uuid);
