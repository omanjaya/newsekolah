-- 0115 created the violation_attachments tenant_isolation policy with the
-- plain uuid cast that 0110 replaced everywhere else. An emptied
-- app.tenant_id ('' after a pooled connection's first tenant transaction)
-- makes that cast raise 22P02 instead of matching no rows, so use the same
-- nullif form as every other policy.
alter policy tenant_isolation on violation_attachments
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
