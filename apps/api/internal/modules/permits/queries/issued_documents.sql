-- name: CreateIssuedDocument :one
insert into issued_documents (
  tenant_id, kind, entity_type, entity_id, number, asset_id, sha256, verification_code_hash, issued_by
)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
returning *;

-- name: GetIssuedDocumentByVerificationHash :one
select * from issued_documents where tenant_id = $1 and verification_code_hash = $2;

-- name: GetIssuedDocumentByEntity :one
select * from issued_documents where tenant_id = $1 and entity_type = $2 and entity_id = $3 and kind = $4;

-- name: RevokeIssuedDocumentByEntity :many
-- Marks the document issued for an entity as no longer valid, so the
-- public verify page reports it revoked. Idempotent: an already revoked
-- row keeps its original revoked_at.
update issued_documents
set revoked_at = coalesce(revoked_at, now())
where tenant_id = $1 and entity_type = $2 and entity_id = $3 and kind = $4
returning *;
