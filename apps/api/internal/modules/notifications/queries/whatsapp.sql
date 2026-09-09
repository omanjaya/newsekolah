-- name: UpsertWhatsAppProviderConfig :exec
insert into whatsapp_provider_configs (
  tenant_id, provider, phone_number_id, access_token_encrypted, access_token_key_id,
  gateway_url, gateway_header_name, gateway_header_value_encrypted, gateway_header_key_id, is_active
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
on conflict (tenant_id) do update set
  provider = excluded.provider,
  phone_number_id = excluded.phone_number_id,
  access_token_encrypted = excluded.access_token_encrypted,
  access_token_key_id = excluded.access_token_key_id,
  gateway_url = excluded.gateway_url,
  gateway_header_name = excluded.gateway_header_name,
  gateway_header_value_encrypted = excluded.gateway_header_value_encrypted,
  gateway_header_key_id = excluded.gateway_header_key_id,
  is_active = excluded.is_active,
  updated_at = now();

-- name: GetWhatsAppProviderConfig :one
select * from whatsapp_provider_configs where tenant_id = $1;

-- name: GetWhatsAppProviderConfigByPhoneNumberID :one
select * from whatsapp_provider_configs where phone_number_id = $1 and phone_number_id <> '';

-- name: InsertWhatsAppTemplate :one
insert into whatsapp_templates (tenant_id, name, locale, meta_template_name, body, placeholders)
values ($1, $2, $3, $4, $5, $6)
returning *;

-- name: UpdateWhatsAppTemplate :one
update whatsapp_templates
set locale = $3, meta_template_name = $4, body = $5, placeholders = $6, updated_at = now()
where tenant_id = $1 and id = $2
returning *;

-- name: DeleteWhatsAppTemplate :execrows
delete from whatsapp_templates where tenant_id = $1 and id = $2;

-- name: GetWhatsAppTemplate :one
select * from whatsapp_templates where tenant_id = $1 and id = $2;

-- name: GetWhatsAppTemplateByName :one
select * from whatsapp_templates where tenant_id = $1 and name = $2;

-- name: ListWhatsAppTemplates :many
select * from whatsapp_templates where tenant_id = $1 order by name;

-- name: SetDeliveryTemplateAndPayload :exec
update message_deliveries
set template_id = $3, payload = $4
where tenant_id = $1 and id = $2;

-- name: GetWhatsAppDelivery :one
select * from message_deliveries where tenant_id = $1 and id = $2 and channel = 'whatsapp';

-- name: ListWhatsAppDeliveries :many
select *
from message_deliveries
where tenant_id = sqlc.arg(tenant_id)::uuid
  and channel = 'whatsapp'
  and (sqlc.arg(status)::text = '' or status = sqlc.arg(status)::text)
  and (
    sqlc.arg(has_cursor)::boolean = false
    or created_at < sqlc.arg(cursor_created_at)::timestamptz
    or (created_at = sqlc.arg(cursor_created_at)::timestamptz and id < sqlc.arg(cursor_id)::uuid)
  )
order by created_at desc, id desc
limit sqlc.arg(page_limit)::int;

-- name: UpdateWhatsAppDeliveryReceipt :execrows
update message_deliveries
set status = $3,
    delivered_at = case when $3 = 'delivered' then $4 else delivered_at end,
    read_at = case when $3 = 'read' then $4 else read_at end
where tenant_id = $1 and provider_message_id = $2;
