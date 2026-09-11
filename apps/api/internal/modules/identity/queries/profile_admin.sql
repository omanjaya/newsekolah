-- name: UpdateOwnProfile :exec
update users set username = $3, name = $4, email = $5, phone = $6, locale = $7 where tenant_id = $1 and id = $2;

-- name: GetUserProfile :one
select * from user_profiles where tenant_id = $1 and user_id = $2;

-- name: CreateAsset :one
insert into assets (tenant_id, bucket, object_key, mime, size_bytes, sha256, kind, visibility, created_by)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
returning *;

-- name: GetAssetByID :one
select * from assets where tenant_id = $1 and id = $2 and deleted_at is null;
