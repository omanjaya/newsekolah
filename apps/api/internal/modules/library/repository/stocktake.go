package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateStocktake(ctx context.Context, s domain.Stocktake) (domain.Stocktake, error) {
	row, err := r.queries(ctx).CreateStocktake(ctx, db.CreateStocktakeParams{
		TenantID: s.TenantID, Name: s.Name, StartedOn: pdatabase.Date(s.StartedOn), CoordinatorUserID: s.CoordinatorUserID, Notes: s.Notes,
	})
	if err != nil {
		return domain.Stocktake{}, fmt.Errorf("create stocktake: %w", err)
	}
	return toStocktake(row), nil
}

func (r *Repository) GetStocktake(ctx context.Context, tenantID, id uuid.UUID) (domain.Stocktake, bool, error) {
	row, err := r.queries(ctx).GetStocktake(ctx, db.GetStocktakeParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Stocktake{}, false, nil
	}
	if err != nil {
		return domain.Stocktake{}, false, fmt.Errorf("get stocktake: %w", err)
	}
	return toStocktake(row), true, nil
}

func (r *Repository) ListStocktakes(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]domain.Stocktake, error) {
	rows, err := r.queries(ctx).ListStocktakes(ctx, db.ListStocktakesParams{TenantID: tenantID, Limit: int32(limit), Offset: int32(offset)}) //nolint:gosec // clamped
	if err != nil {
		return nil, fmt.Errorf("list stocktakes: %w", err)
	}
	out := make([]domain.Stocktake, len(rows))
	for i, row := range rows {
		out[i] = toStocktake(row)
	}
	return out, nil
}

func (r *Repository) CloseStocktake(ctx context.Context, tenantID, id uuid.UUID, endedOn time.Time, notes string) (domain.Stocktake, bool, error) {
	row, err := r.queries(ctx).CloseStocktake(ctx, db.CloseStocktakeParams{TenantID: tenantID, ID: id, EndedOn: pdatabase.Date(endedOn), Notes: notes})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Stocktake{}, false, nil
	}
	if err != nil {
		return domain.Stocktake{}, false, fmt.Errorf("close stocktake: %w", err)
	}
	return toStocktake(row), true, nil
}

func (r *Repository) RecordStocktakeScan(ctx context.Context, scan domain.StocktakeScan) (domain.StocktakeScan, error) {
	row, err := r.queries(ctx).RecordStocktakeScan(ctx, db.RecordStocktakeScanParams{
		TenantID: scan.TenantID, StocktakeID: scan.StocktakeID, CopyID: scan.CopyID, Barcode: scan.Barcode,
		ScannedAt: pdatabase.Timestamptz(scan.ScannedAt), ScannedByUserID: scan.ScannedByUser,
	})
	if err != nil {
		return domain.StocktakeScan{}, fmt.Errorf("record stocktake scan: %w", err)
	}
	return toScan(row), nil
}

func (r *Repository) ListStocktakeScans(ctx context.Context, tenantID, stocktakeID uuid.UUID) ([]domain.StocktakeScan, error) {
	rows, err := r.queries(ctx).ListStocktakeScans(ctx, db.ListStocktakeScansParams{TenantID: tenantID, StocktakeID: stocktakeID})
	if err != nil {
		return nil, fmt.Errorf("list stocktake scans: %w", err)
	}
	out := make([]domain.StocktakeScan, len(rows))
	for i, row := range rows {
		out[i] = toScan(row)
	}
	return out, nil
}
