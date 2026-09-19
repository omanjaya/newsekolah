-- A schedule with recorded activity is historical data, not a disposable row.
-- RESTRICT protects individual, block and academic-year deletion, including
-- concurrent attendance/substitution inserts.
alter table attendance_sessions drop constraint attendance_sessions_schedule_id_fkey;
alter table attendance_sessions add constraint attendance_sessions_schedule_id_fkey
  foreign key (schedule_id) references schedules (id) on delete restrict;
alter table substitution_requests drop constraint substitution_requests_schedule_id_fkey;
alter table substitution_requests add constraint substitution_requests_schedule_id_fkey
  foreign key (schedule_id) references schedules (id) on delete restrict;

create function protect_schedule_history() returns trigger language plpgsql as $$
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

create trigger trg_schedule_history_guard before update on schedules
  for each row execute function protect_schedule_history();
