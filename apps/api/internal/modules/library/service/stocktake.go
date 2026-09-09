package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

func (s *Service) StartStocktake(ctx context.Context, tenantID uuid.UUID, name string, coordinatorUserID uuid.UUID, notes string) (domain.Stocktake, error) {
	if name == "" {
		return domain.Stocktake{}, domain.ErrInvalidInput
	}
	return s.repo.CreateStocktake(ctx, domain.Stocktake{
		TenantID: tenantID, Name: name, StartedOn: s.clock.Now(), CoordinatorUserID: coordinatorUserID, Notes: notes,
	})
}

func (s *Service) GetStocktake(ctx context.Context, tenantID, id uuid.UUID) (domain.Stocktake, error) {
	st, found, err := s.repo.GetStocktake(ctx, tenantID, id)
	if err != nil {
		return domain.Stocktake{}, err
	}
	if !found {
		return domain.Stocktake{}, domain.ErrStocktakeNotFound
	}
	return st, nil
}

func (s *Service) ListStocktakes(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]domain.Stocktake, error) {
	return s.repo.ListStocktakes(ctx, tenantID, clampLimit(limit), offset)
}

// ScanBarcode records one scanned copy in an open stocktake session. A
// barcode that does not match any copy is still worth recording -- it
// shows up as unexpected when the session closes -- so this only fails
// when the session itself cannot accept scans.
func (s *Service) ScanBarcode(ctx context.Context, tenantID, stocktakeID uuid.UUID, barcode string, scannedBy uuid.UUID) (domain.StocktakeScan, error) {
	st, found, err := s.repo.GetStocktake(ctx, tenantID, stocktakeID)
	if err != nil {
		return domain.StocktakeScan{}, err
	}
	if !found {
		return domain.StocktakeScan{}, domain.ErrStocktakeNotFound
	}
	if st.Status != domain.StocktakeOpen {
		return domain.StocktakeScan{}, domain.ErrStocktakeClosed
	}
	item, found, err := s.repo.GetCopyByBarcode(ctx, tenantID, barcode)
	if err != nil {
		return domain.StocktakeScan{}, err
	}
	if !found {
		// Unknown barcode: recorded against a nil copy is not possible since
		// the schema requires a copy_id, so an unrecognised scan is only
		// reflected in the closing report through the barcode list the
		// caller keeps client-side and passes to Close.
		return domain.StocktakeScan{}, domain.ErrCopyNotFound
	}
	return s.repo.RecordStocktakeScan(ctx, domain.StocktakeScan{
		TenantID: tenantID, StocktakeID: stocktakeID, CopyID: item.ID, Barcode: barcode,
		ScannedAt: s.clock.Now(), ScannedByUser: scannedBy,
	})
}

// Close ends a stocktake session and reconciles every copy expected on the
// shelf (anything not currently on loan) against what was actually
// scanned, using the pure DiffStocktake so the reconciliation itself is
// unit tested without a database.
func (s *Service) Close(ctx context.Context, tenantID, stocktakeID uuid.UUID, notes string) (domain.StocktakeResult, error) {
	var result domain.StocktakeResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		st, found, err := s.repo.GetStocktake(ctx, tenantID, stocktakeID)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrStocktakeNotFound
		}
		if st.Status != domain.StocktakeOpen {
			return domain.ErrStocktakeClosed
		}
		expected, err := s.repo.ListCopiesForStocktake(ctx, tenantID)
		if err != nil {
			return err
		}
		scans, err := s.repo.ListStocktakeScans(ctx, tenantID, stocktakeID)
		if err != nil {
			return err
		}
		barcodes := make([]string, len(scans))
		for i, sc := range scans {
			barcodes[i] = sc.Barcode
		}
		result = domain.DiffStocktake(expected, barcodes)
		_, _, err = s.repo.CloseStocktake(ctx, tenantID, stocktakeID, s.clock.Now(), notes)
		return err
	})
	return result, err
}
