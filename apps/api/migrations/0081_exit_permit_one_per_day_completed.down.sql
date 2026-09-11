drop index if exists ux_workflow_instances_one_exit_permit_per_day;

create unique index ux_workflow_instances_one_exit_permit_per_day
  on workflow_instances (tenant_id, subject_user_id, opened_date)
  where kind = 'exit_permit' and status in ('in_progress', 'approved');
