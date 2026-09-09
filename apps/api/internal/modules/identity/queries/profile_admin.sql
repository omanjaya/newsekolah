-- name: UpdateOwnProfile :exec
update users set name = $3, email = $4, phone = $5, locale = $6 where tenant_id = $1 and id = $2;

-- name: CreateAsset :one
insert into assets (tenant_id, bucket, object_key, mime, size_bytes, sha256, kind, visibility, created_by)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
returning *;

-- name: GetAssetByID :one
select * from assets where tenant_id = $1 and id = $2 and deleted_at is null;
