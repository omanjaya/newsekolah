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
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
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

func (r *Repository) CloseStocktake(ctx context.Context, tenantID, id uuid.UUID, endedOn time.Time, notes string, result domain.StocktakeResult, markMissingAs domain.MarkMissingAs) (domain.Stocktake, bool, error) {
	row, err := r.queries(ctx).CloseStocktake(ctx, db.CloseStocktakeParams{
		TenantID: tenantID, ID: id, EndedOn: pdatabase.Date(endedOn), Notes: notes,
		MissingCount: int32(len(result.Missing)), UnexpectedCount: int32(len(result.Unexpected)), //nolint:gosec // bounded by catalogue size
		MisplacedCount: int32(len(result.Misplaced)), MarkMissingAs: string(markMissingAs), //nolint:gosec // bounded by catalogue size
	})
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
		TenantID: scan.TenantID, StocktakeID: scan.StocktakeID, CopyID: pdatabase.NullUUID(scan.CopyID), RawCode: scan.RawCode,
		Outcome: string(scan.Outcome), LocationID: pdatabase.NullUUID(scan.LocationID),
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

func (r *Repository) CountStocktakeScans(ctx context.Context, tenantID, stocktakeID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountStocktakeScans(ctx, db.CountStocktakeScansParams{TenantID: tenantID, StocktakeID: stocktakeID})
	if err != nil {
		return 0, fmt.Errorf("count stocktake scans: %w", err)
	}
	return int(n), nil
}

// InsertStocktakeResults persists the anomalies DiffStocktake found: one
// row per missing, unexpected, or misplaced copy, so Close's reconciliation
// survives after the response is gone.
func (r *Repository) InsertStocktakeResults(ctx context.Context, tenantID, stocktakeID uuid.UUID, result domain.StocktakeResult) error {
	q := r.queries(ctx)
	for _, c := range result.Missing {
		if err := q.InsertStocktakeResult(ctx, db.InsertStocktakeResultParams{
			TenantID: tenantID, StocktakeID: stocktakeID, CopyID: pgUUID(c.ID), Outcome: "missing",
		}); err != nil {
			return fmt.Errorf("insert stocktake result (missing): %w", err)
		}
	}
	for _, c := range result.Unexpected {
		if err := q.InsertStocktakeResult(ctx, db.InsertStocktakeResultParams{
			TenantID: tenantID, StocktakeID: stocktakeID, CopyID: pgUUID(c.ID), Outcome: "unexpected",
		}); err != nil {
			return fmt.Errorf("insert stocktake result (unexpected): %w", err)
		}
	}
	for _, m := range result.Misplaced {
		if err := q.InsertStocktakeResult(ctx, db.InsertStocktakeResultParams{
			TenantID: tenantID, StocktakeID: stocktakeID, CopyID: pgUUID(m.Copy.ID), Outcome: "misplaced",
			FoundLocationID: pgUUID(m.FoundLocationID),
		}); err != nil {
			return fmt.Errorf("insert stocktake result (misplaced): %w", err)
		}
	}
	return nil
}

func (r *Repository) ListStocktakeResults(ctx context.Context, tenantID, stocktakeID uuid.UUID) ([]service.StocktakeResultRow, error) {
	rows, err := r.queries(ctx).ListStocktakeResults(ctx, db.ListStocktakeResultsParams{TenantID: tenantID, StocktakeID: stocktakeID})
	if err != nil {
		return nil, fmt.Errorf("list stocktake results: %w", err)
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		if row.CopyID.Valid {
			ids = append(ids, uuid.UUID(row.CopyID.Bytes))
		}
	}
	copies, err := r.GetCopiesByIDs(ctx, tenantID, ids)
	if err != nil {
		return nil, err
	}
	byID := make(map[uuid.UUID]domain.Copy, len(copies))
	for _, c := range copies {
		byID[c.ID] = c
	}
	out := make([]service.StocktakeResultRow, len(rows))
	for i, row := range rows {
		item := service.StocktakeResultRow{Outcome: row.Outcome, FoundLocationID: pdatabase.UUIDOrNil(row.FoundLocationID)}
		if row.CopyID.Valid {
			if c, ok := byID[uuid.UUID(row.CopyID.Bytes)]; ok {
				item.Copy = &c
			}
		}
		out[i] = item
	}
	return out, nil
}
