alter table exit_permits drop constraint if exists fk_exit_permits_gate_token;
alter table workflow_events drop constraint if exists fk_workflow_events_scan_token;
drop table if exists scan_tokens;
