drop policy if exists platform_access on push_devices;
drop index if exists ux_push_devices_tenant_id_endpoint_hash;
alter table push_devices add constraint push_devices_endpoint_hash_key unique (endpoint_hash);
