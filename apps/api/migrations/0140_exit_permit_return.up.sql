-- The student's return after an exit permit (SION student_permits' "out"
-- then "in", with its return_required flag). The workflow instance still
-- completes at the gate scan, which ends the approval chain; the return is
-- a fact on the permit itself, recorded by security when the student comes
-- back through the gate.
--
-- return_required: false when the student goes home and is not expected
--   back the same day (chosen with the request).
-- expected_return_at: the end of the permit's last lesson period on the
--   exit day, in the school's time zone, stored at the gate scan. A return
--   after it is late; null for permits that exited before this migration
--   or need no return.
-- returned_at / return_security_user_id: when, and by whom, the return
--   was recorded.
alter table exit_permits
  add column return_required boolean not null default true,
  add column expected_return_at timestamptz,
  add column returned_at timestamptz,
  add column return_security_user_id uuid references users (id) on delete set null;

-- Permits that exited before this migration have no expected return and
-- were never tracked: do not list them as students still out.
update exit_permits set return_required = false where exited_at is not null;

-- The gate's "not back yet" list: exited, return expected, no return yet.
create index ix_exit_permits_awaiting_return on exit_permits (tenant_id, expected_return_at)
  where exited_at is not null and return_required and returned_at is null;
