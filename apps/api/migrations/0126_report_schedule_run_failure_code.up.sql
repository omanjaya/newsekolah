-- Why a scheduled report run failed, as a stable code the app can name in
-- the reader's language. error_message keeps the technical detail for
-- support; it is English and never shown to a school admin as is.
alter table report_schedule_runs
  add column failure_code text not null default ''
    check (failure_code in ('', 'render_failed', 'upload_failed', 'send_failed'));

-- Runs that failed before this column existed: derive the code from the
-- prefix the service wrote into error_message.
update report_schedule_runs
set failure_code = case
  when error_message like 'render:%' then 'render_failed'
  when error_message like 'upload:%' or error_message like 'sign download link:%' then 'upload_failed'
  else 'send_failed'
end
where status = 'failed';
