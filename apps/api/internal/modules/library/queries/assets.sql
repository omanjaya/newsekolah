-- The assets table is shared platform infrastructure
-- (migrations/0001_platform_core.up.sql), not owned by any single
-- module. Library writes here for covers downloaded from an external
-- ISBN lookup, the same way permits writes evidence images and rendered
-- letters (internal/modules/permits/queries/assets.sql).

-- name: CreateLibraryAsset :one
insert into assets (tenant_id, bucket, object_key, mime, size_bytes, sha256, kind, visibility, created_by)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
returning id;
