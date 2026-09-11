alter table counselings drop column if exists problem_description_encrypted;
alter table counselings drop column if exists career_goals_encrypted;
alter table counselings drop column if exists topic;
drop index if exists ux_violation_records_workflow_type;
