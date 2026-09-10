drop table if exists visitor_incidents;
drop table if exists visitor_visits;
drop table if exists visitor_expected_guests;

alter table document_templates drop constraint document_templates_kind_check;
alter table document_templates add constraint document_templates_kind_check check (kind in (
  'leave_letter', 'warning_letter', 'class_journal', 'member_card', 'item_label', 'clearance_letter', 'report'
));
