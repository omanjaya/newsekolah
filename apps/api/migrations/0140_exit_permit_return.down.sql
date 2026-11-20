drop index if exists ix_exit_permits_awaiting_return;

alter table exit_permits
  drop column return_security_user_id,
  drop column returned_at,
  drop column expected_return_at,
  drop column return_required;
