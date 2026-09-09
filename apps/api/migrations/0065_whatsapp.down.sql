drop index if exists ix_message_deliveries_provider_message_id;

alter table message_deliveries drop constraint message_deliveries_status_check;
alter table message_deliveries add constraint message_deliveries_status_check
  check (status in ('pending', 'sent', 'failed'));

alter table message_deliveries
  drop column template_id,
  drop column payload,
  drop column delivered_at,
  drop column read_at;

drop table if exists whatsapp_templates;
drop table if exists whatsapp_provider_configs;
