-- Bug fix: "one exit permit per student per day" was enforced by two
-- different definitions of "day". The service pre-check
-- (GetExitPermitInstanceForSubjectToday) already used the tenant's own
-- local calendar day (permits/service/tenant.go's tenantNow), but it
-- compared that against workflow_instances.opened_date, a fixed-UTC
-- generated column (0041_workflow_instances_events.up.sql), and
-- ux_workflow_instances_one_exit_permit_per_day (0041, tightened by
-- 0081_exit_permit_one_per_day_completed) is keyed on that same
-- fixed-UTC column. For any tenant not on UTC this disagrees with the
-- school's own calendar around midnight UTC: for a UTC+8 tenant
-- (08:00 local = 00:00 UTC) a permit opened at 23:00 local and another
-- opened at 07:30 local the next calendar day both land on the same UTC
-- date and would be wrongly refused as duplicates, while two permits on
-- the very same local day that straddle 08:00 local land on different
-- UTC dates and would wrongly be let through.
--
-- local_date is the tenant-local calendar day the instance opened,
-- computed by the service at write time from the same tenant timezone
-- permits/service/tenant.go resolves (tenants.timezone), so it always
-- agrees with the service's own pre-check. opened_date is left in place:
-- it is still read directly by late_arrivals' GetInProgressLateArrivalToday
-- query (queries/late_arrivals.sql), which this migration does not touch.
alter table workflow_instances add column local_date date;

-- Backfill every existing row from opened_at, converted with its own
-- tenant's timezone -- the same conversion the service now does at
-- insert time (s.tenantNow), just run once here for history.
update workflow_instances wi
set local_date = (wi.opened_at at time zone t.timezone)::date
from tenants t
where t.id = wi.tenant_id;

alter table workflow_instances alter column local_date set not null;

-- Replace the fixed-UTC unique index with one keyed on the tenant-local
-- day. Same status filter 0081 left it at ('in_progress', 'approved',
-- 'completed') -- an already-exited permit still counts as "today's
-- permit" for this guard.
drop index if exists ux_workflow_instances_one_exit_permit_per_day;

create unique index ux_workflow_instances_one_exit_permit_per_day
  on workflow_instances (tenant_id, subject_user_id, local_date)
  where kind = 'exit_permit' and status in ('in_progress', 'approved', 'completed');
