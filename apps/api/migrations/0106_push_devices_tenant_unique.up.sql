-- push_devices.endpoint_hash was globally unique, so a device re-registering
-- under a different tenant (a parent with children in two schools, or a
-- recycled FCM token) hit a unique violation instead of updating its own
-- tenant's row. Scope the uniqueness per tenant, and add the same
-- platform_access escape hatch as whatsapp_provider_configs (0065) so the
-- service can find and remove a stale row left behind under the previous
-- tenant before re-registering the device under the new one.
alter table push_devices drop constraint push_devices_endpoint_hash_key;

create unique index ux_push_devices_tenant_id_endpoint_hash
  on push_devices (tenant_id, endpoint_hash);

create policy platform_access on push_devices
  using (current_setting('app.platform_admin', true) = 'true')
  with check (current_setting('app.platform_admin', true) = 'true');
