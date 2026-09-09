-- name: GetDefaultDocumentTemplate :one
select * from document_templates
where tenant_id = $1 and kind = $2 and is_default and deleted_at is null
limit 1;

-- name: GetDocumentTemplateByID :one
select * from document_templates where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: ListDocumentTemplates :many
select * from document_templates where tenant_id = $1 and deleted_at is null order by kind, name;

-- name: CreateDocumentTemplate :one
insert into document_templates (tenant_id, kind, name, engine, body, variables, is_default, created_by)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: UpdateDocumentTemplate :one
update document_templates
set name = $3, body = $4, variables = $5, updated_at = now()
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;

-- name: ClearDefaultDocumentTemplate :exec
update document_templates set is_default = false, updated_at = now()
where tenant_id = $1 and kind = $2 and is_default;

-- name: SetDefaultDocumentTemplate :one
update document_templates set is_default = true, updated_at = now()
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;
