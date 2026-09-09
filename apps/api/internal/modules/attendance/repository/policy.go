package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) GetLatestPolicy(ctx context.Context, tenantID uuid.UUID, kind string) ([]byte, int, bool, error) {
	row, err := r.queries(ctx).GetLatestTenantPolicy(ctx, db.GetLatestTenantPolicyParams{TenantID: tenantID, Kind: kind})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, false, nil
		}
		return nil, 0, false, err
	}
	return row.Config, int(row.Version), true, nil
}

func (r *Repository) CreatePolicy(ctx context.Context, tenantID uuid.UUID, kind string, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error {
	_, err := r.queries(ctx).CreateTenantPolicy(ctx, db.CreateTenantPolicyParams{
		TenantID: tenantID, Kind: kind, Version: int32(version), Config: config, //nolint:gosec // policy versions are small
		EffectiveFrom: pdatabase.Date(effectiveFrom), CreatedBy: pdatabase.NullUUID(createdBy),
	})
	return err
}
