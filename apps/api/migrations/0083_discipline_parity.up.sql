-- Discipline parity fixes: idempotent violation writes from other modules
-- (attendance sessions, late-arrival review) and counseling topics.

-- One violation per (workflow_instance_id, violation_type_id): a second
-- call from the same workflow with the same type must not double-count.
create unique index ux_violation_records_workflow_type on violation_records (tenant_id, workflow_instance_id, violation_type_id)
  where workflow_instance_id is not null;

-- Counseling topic, alongside the existing session format (kind). Content
-- fields stay encrypted like content/follow_up_plan (docs/08-security.md).
alter table counselings add column topic text not null default 'problem'
  check (topic in ('career', 'problem', 'personal', 'learning', 'social', 'other'));
alter table counselings add column career_goals_encrypted bytea;
alter table counselings add column problem_description_encrypted bytea;
