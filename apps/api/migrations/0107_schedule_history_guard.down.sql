drop trigger trg_schedule_history_guard on schedules;
drop function protect_schedule_history();
alter table attendance_sessions drop constraint attendance_sessions_schedule_id_fkey;
alter table attendance_sessions add constraint attendance_sessions_schedule_id_fkey
  foreign key (schedule_id) references schedules (id) on delete cascade;
alter table substitution_requests drop constraint substitution_requests_schedule_id_fkey;
alter table substitution_requests add constraint substitution_requests_schedule_id_fkey
  foreign key (schedule_id) references schedules (id) on delete cascade;
