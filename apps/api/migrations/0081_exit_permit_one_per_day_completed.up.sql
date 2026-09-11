-- Regression fix: the old app capped a student at one exit-permit request
-- per day regardless of status, including ones that already exited
-- (exit_permit_api.go). The original index only blocked a second request
-- while the first was 'in_progress' or 'approved', so a student could
-- reopen a new one immediately after gate-scanning out of the first.
drop index if exists ux_workflow_instances_one_exit_permit_per_day;

create unique index ux_workflow_instances_one_exit_permit_per_day
  on workflow_instances (tenant_id, subject_user_id, opened_date)
  where kind = 'exit_permit' and status in ('in_progress', 'approved', 'completed');
