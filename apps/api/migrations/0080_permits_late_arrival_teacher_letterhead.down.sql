alter table document_templates drop column if exists letterhead_asset_id;

drop index if exists ix_late_arrivals_duty_teacher;
alter table late_arrivals drop column if exists duty_teacher_user_id;
