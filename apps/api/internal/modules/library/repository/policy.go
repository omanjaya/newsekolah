package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) GetLatestPolicy(ctx context.Context, tenantID uuid.UUID) ([]byte, int, bool, error) {
	row, err := r.queries(ctx).GetLatestLibraryPolicy(ctx, tenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, false, nil
	}
	if err != nil {
		return nil, 0, false, fmt.Errorf("get latest library policy: %w", err)
	}
	return row.Config, int(row.Version), true, nil
}

func (r *Repository) CreatePolicy(ctx context.Context, tenantID uuid.UUID, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error {
	err := r.queries(ctx).CreateLibraryPolicy(ctx, db.CreateLibraryPolicyParams{
		TenantID: tenantID, Version: int32(version), Config: config, //nolint:gosec // small, incrementing counter
		EffectiveFrom: pdatabase.Date(effectiveFrom), CreatedBy: pdatabase.NullUUID(createdBy),
	})
	if err != nil {
		return fmt.Errorf("create library policy: %w", err)
	}
	return nil
}
