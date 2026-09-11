package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
)

func (r *Repository) CreateAsset(ctx context.Context, tenantID uuid.UUID, bucket, objectKey, mime string, sizeBytes int64, sha256, kind, visibility string, createdBy uuid.UUID) (uuid.UUID, error) {
	id, err := r.queries(ctx).CreateLibraryAsset(ctx, db.CreateLibraryAssetParams{
		TenantID: tenantID, Bucket: bucket, ObjectKey: objectKey, Mime: mime, SizeBytes: sizeBytes,
		Sha256: sha256, Kind: kind, Visibility: visibility, CreatedBy: pgUUID(createdBy),
	})
	if err != nil {
		return uuid.Nil, fmt.Errorf("create library asset: %w", err)
	}
	return id, nil
}
