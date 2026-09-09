-- Interim product display name; tenants override it through branding settings.
insert into platform_settings (key, value)
values ('product_name', '"SION"'::jsonb)
on conflict (key) do nothing;
