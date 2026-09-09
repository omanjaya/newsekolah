-- name: ListWebAuthnCredentials :many
select * from webauthn_credentials where tenant_id = $1 and user_id = $2 order by created_at;

-- name: GetWebAuthnCredential :one
select * from webauthn_credentials where tenant_id = $1 and id = $2;

-- name: InsertWebAuthnCredential :one
insert into webauthn_credentials (tenant_id, user_id, credential_id, public_key, sign_count, transports, name, data)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: UpdateWebAuthnCredentialUsage :exec
update webauthn_credentials set sign_count = $3, data = $4, last_used_at = now()
where tenant_id = $1 and id = $2;

-- name: RenameWebAuthnCredential :one
update webauthn_credentials set name = $3 where tenant_id = $1 and id = $2
returning *;

-- name: DeleteWebAuthnCredential :exec
delete from webauthn_credentials where tenant_id = $1 and id = $2;
