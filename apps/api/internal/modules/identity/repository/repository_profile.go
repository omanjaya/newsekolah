package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) UpdateOwnProfileRecord(ctx context.Context, tenantID, userID uuid.UUID, name, email, phone, locale string) error {
	err := r.queries(ctx).UpdateOwnProfile(ctx, db.UpdateOwnProfileParams{
		TenantID: tenantID, ID: userID, Name: name, Email: nullableText(email), Phone: nullableText(phone), Locale: locale,
	})
	if err != nil {
		return fmt.Errorf("update own profile: %w", err)
	}
	return nil
}

func (r *Repository) CreateAssetRecord(ctx context.Context, in service.NewAsset) (service.AssetRecord, error) {
	row, err := r.queries(ctx).CreateAsset(ctx, db.CreateAssetParams{
		TenantID: in.TenantID, Bucket: in.Bucket, ObjectKey: in.ObjectKey, Mime: in.Mime,
		SizeBytes: in.SizeBytes, Sha256: in.SHA256, Kind: in.Kind, Visibility: in.Visibility,
		CreatedBy: pdatabase.NullUUID(uuid.NullUUID{UUID: in.CreatedBy, Valid: true}),
	})
	if err != nil {
		return service.AssetRecord{}, fmt.Errorf("create asset: %w", err)
	}
	return service.AssetRecord{ID: row.ID, Mime: row.Mime}, nil
}
