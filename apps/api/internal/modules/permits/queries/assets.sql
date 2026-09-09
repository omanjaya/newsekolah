-- cross-module read/write; the assets table is shared platform
-- infrastructure (migrations/0001_platform_core.up.sql), not owned by any
-- single feature module. permits writes here for evidence images it
-- re-encodes and letters it renders, same as any other module would.

-- name: CreatePermitsAsset :one
insert into assets (tenant_id, bucket, object_key, mime, size_bytes, sha256, kind, visibility, created_by)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
returning id;

-- name: GetAssetObjectKey :one
select object_key from assets where tenant_id = $1 and id = $2 and deleted_at is null;
