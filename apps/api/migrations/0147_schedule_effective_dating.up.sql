-- Effective-dated timetable. A schedule row is one version of a weekly
-- lesson: it is on the timetable from effective_from through
-- effective_until, both bounds inclusive, and open-ended (to the end of
-- its academic year) while effective_until is null. Changing or removing a
-- lesson that already has history no longer rewrites the row: the service
-- ends the old version the day before the change date and inserts a new
-- one from it, so every recorded session, journal and substitution keeps
-- pointing at the lesson exactly as it was taught
-- (docs/06-database-schema.md section 5).
--
-- Both bounds are stored on the row's own weekday (the service snaps
-- them): two versions of the same weekday then overlap only when they
-- share a real lesson date, which is what the exclusion constraints below
-- compare.
alter table schedules add column effective_from date, add column effective_until date;

-- Existing rows keep the whole academic year: from its first date that
-- falls on the row's weekday, or earlier when legacy history predates the
-- year (LEAST ignores the null of a row without history), with no end.
-- updated_at is left alone: nothing about the lesson changed.
alter table schedules disable trigger trg_schedules_set_updated_at;
update schedules s set effective_from = least(
    ay.starts_on + ((s.day_of_week - extract(isodow from ay.starts_on)::int + 7) % 7),
    (select min(a.date) from attendance_sessions a where a.schedule_id = s.id),
    (select min(r.date) from substitution_requests r where r.schedule_id = s.id))
  from academic_years ay where ay.id = s.academic_year_id;
alter table schedules enable trigger trg_schedules_set_updated_at;

alter table schedules
  alter column effective_from set not null,
  add constraint ck_schedules_effective_range
    check (effective_until is null or effective_until >= effective_from),
  add column effective_range daterange
    generated always as (daterange(effective_from, effective_until, '[]')) stored;

-- The two anti-clash constraints from 0030 were declared without names, so
-- Postgres named (and possibly truncated) them itself: drop them by lookup.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'schedules'::regclass and contype = 'x' loop
    execute format('alter table schedules drop constraint %I', c.conname);
  end loop;
end $$;

-- Same anti-clash rule, now between versions whose dates overlap: a
-- retired version no longer blocks the slot from the day after it ends.
-- Named, so the service maps a violation to the right conflict.
alter table schedules
  add constraint ex_schedules_class_slot exclude using gist (
    academic_year_id with =, class_id with =, day_of_week with =,
    period_range with &&, effective_range with &&),
  add constraint ex_schedules_teacher_slot exclude using gist (
    academic_year_id with =, teacher_user_id with =, day_of_week with =,
    period_range with &&, effective_range with &&);

-- The history guard keeps 0144's identity branch verbatim and adds a range
-- branch: a version may be shortened or moved in time only while every
-- recorded session and every pending or accepted substitution still falls
-- inside it. Placeholders left outside go, as they do on an identity
-- change. A BEFORE trigger cannot read the generated effective_range of
-- NEW yet, so the range is built from the two columns.
--
-- Like 0107 and 0144 this is an integrity backstop (docs/04-clean-code.md
-- section 4): the service decides the change date and refuses a too-early
-- one with a precise error before the row is touched.
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
  if (old.effective_from, old.effective_until) is distinct from (new.effective_from, new.effective_until) then
    if exists (select 1 from attendance_sessions a
               where a.schedule_id = old.id
                 and not (daterange(new.effective_from, new.effective_until, '[]') @> a.date)
                 and attendance_session_recorded(a.id))
       or exists (select 1 from substitution_requests r
                  where r.schedule_id = old.id
                    and r.status in ('pending', 'accepted')
                    and not (daterange(new.effective_from, new.effective_until, '[]') @> r.date)) then
      raise exception 'schedule history falls outside its new effective range'
        using errcode = '23503', constraint = 'schedule_history_range';
    end if;
    delete from attendance_sessions a
    where a.schedule_id = old.id
      and not (daterange(new.effective_from, new.effective_until, '[]') @> a.date)
      and not attendance_session_recorded(a.id);
  end if;
  return new;
end;
$$;

-- The insert-side half of the same invariant: a session or a substitution
-- can only be created for a date its schedule version is in effect on, so
-- nothing lands on a lesson after it ended or before it started. FOR KEY
-- SHARE waits for a concurrent retirement (the service holds the row FOR
-- UPDATE while it ends it) and then re-evaluates the WHERE clause against
-- the committed row.
create function require_schedule_in_effect() returns trigger language plpgsql as $$
begin
  perform 1 from schedules s
  where s.id = new.schedule_id
    and s.effective_from <= new.date
    and (s.effective_until is null or s.effective_until >= new.date)
  for key share;
  if not found then
    raise exception 'schedule % is not in effect on %', new.schedule_id, new.date
      using errcode = '23514', constraint = 'schedule_in_effect';
  end if;
  return new;
end;
$$;

create trigger trg_attendance_sessions_schedule_in_effect
  before insert or update of schedule_id, date on attendance_sessions
  for each row execute function require_schedule_in_effect();

create trigger trg_substitution_requests_schedule_in_effect
  before insert or update of schedule_id, date on substitution_requests
  for each row execute function require_schedule_in_effect();

-- Before the day list stopped opening sessions ahead of time, browsing a
-- later week left empty placeholder sessions behind. They would pin a
-- version that is about to end, so they go once here; nothing can be
-- recorded for a future date, so none of them is history. The one-day
-- margin covers schools east of UTC whose today is already tomorrow.
delete from attendance_sessions a
where a.date > current_date + 1 and not attendance_session_recorded(a.id);
