-- Why a webhook delivery's last attempt failed, as a code the web
-- translates. The delivery log used to show last_error, the worker's
-- English Go error text ("receiver responded 405", a dial error chain),
-- to school admins. last_error stays for the server's own diagnosis.
alter table integration_webhook_deliveries
  add column failure_reason text not null default ''
    check (failure_reason in (
      '', 'http_status', 'timeout', 'unreachable', 'redirect_refused', 'endpoint_disabled', 'unknown'
    ));

-- Rows written before the code existed: read it off the error text the
-- worker wrote then.
update integration_webhook_deliveries
set failure_reason = case
  when last_error like 'receiver responded %' then 'http_status'
  when last_error like 'webhook endpoint % is disabled' then 'endpoint_disabled'
  when last_error like '%does not follow redirects%' then 'redirect_refused'
  when last_error like '%Client.Timeout exceeded%' or last_error like '%deadline exceeded%'
    or last_error like '%i/o timeout%' then 'timeout'
  when last_error like 'send webhook request:%' then 'unreachable'
  else 'unknown'
end
where last_error <> '';
