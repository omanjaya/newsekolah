-- Restores the old system's "A_SEBAGIAN" signal (docs/analysis/backend-
-- inventory.md section 1.10/1.11): a day where at least one submitted
-- session was Alpha but not every one was, which the majority/priority
-- daily status algorithm can otherwise mask (e.g. two H sessions outvote
-- one A).
alter table attendance_daily_summary
  add column partial_absence boolean not null default false;
