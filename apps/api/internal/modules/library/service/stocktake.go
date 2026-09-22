package service

import (
	"bytes"
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

func (s *Service) StartStocktake(ctx context.Context, tenantID uuid.UUID, name string, coordinatorUserID uuid.UUID, notes string) (domain.Stocktake, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Stocktake{}, err
	}
	if name == "" {
		return domain.Stocktake{}, domain.ErrInvalidInput
	}
	var created domain.Stocktake
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		created, err = s.repo.CreateStocktake(ctx, domain.Stocktake{
			TenantID: tenantID, Name: name, StartedOn: s.clock.Now(), CoordinatorUserID: coordinatorUserID, Notes: notes,
		})
		return err
	})
	return created, err
}

func (s *Service) GetStocktake(ctx context.Context, tenantID, id uuid.UUID) (domain.Stocktake, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Stocktake{}, err
	}
	var st domain.Stocktake
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var found bool
		var err error
		st, found, err = s.repo.GetStocktake(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !found {
			return domain.ErrStocktakeNotFound
		}
		return nil
	})
	if err != nil {
		return domain.Stocktake{}, err
	}
	return st, nil
}

func (s *Service) ListStocktakes(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]domain.Stocktake, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var stocktakes []domain.Stocktake
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		stocktakes, err = s.repo.ListStocktakes(ctx, tenantID, clampLimit(limit), offset)
		return err
	})
	return stocktakes, err
}

// ScanCodes records a batch of scanned codes (barcode, accession number,
// or RFID) in an open stocktake session. A code that matches no copy is
// recorded with outcome "rejected" instead of failing the request, so a
// librarian scanning a shelf of 200 books doesn't lose the whole batch
// over one smudged barcode.
func (s *Service) ScanCodes(ctx context.Context, tenantID, stocktakeID uuid.UUID, codes []string, locationID uuid.NullUUID, scannedBy uuid.UUID) ([]domain.StocktakeScan, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	if len(codes) == 0 {
		return nil, domain.ErrInvalidInput
	}
	now := s.clock.Now()
	var out []domain.StocktakeScan
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

		out = make([]domain.StocktakeScan, 0, len(codes))
		for _, code := range codes {
			scan := domain.StocktakeScan{
				TenantID: tenantID, StocktakeID: stocktakeID, RawCode: code, LocationID: locationID,
				ScannedAt: now, ScannedByUser: scannedBy, Outcome: domain.ScanRejected,
			}
			if item, found, err := s.repo.FindCopyByCode(ctx, tenantID, code); err != nil {
				return err
			} else if found {
				scan.CopyID = uuid.NullUUID{UUID: item.ID, Valid: true}
				scan.Outcome = domain.ScanFound
			}
			recorded, err := s.repo.RecordStocktakeScan(ctx, scan)
			if err != nil {
				return err
			}
			out = append(out, recorded)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// Progress is a stocktake session's live counters, recomputed from the
// scans recorded so far without waiting for Close.
type Progress struct {
	ExpectedCount  int
	ScannedCount   int
	MissingCount   int
	MisplacedCount int
}

func (s *Service) StocktakeProgress(ctx context.Context, tenantID, stocktakeID uuid.UUID) (Progress, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return Progress{}, err
	}
	var progress Progress
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, err := s.GetStocktake(ctx, tenantID, stocktakeID); err != nil {
			return err
		}
		result, err := s.reconcile(ctx, tenantID, stocktakeID)
		if err != nil {
			return err
		}
		progress = Progress{
			ExpectedCount: result.ExpectedCount, ScannedCount: result.ScannedCount,
			MissingCount: len(result.Missing), MisplacedCount: len(result.Misplaced),
		}
		return nil
	})
	if err != nil {
		return Progress{}, err
	}
	return progress, nil
}

// reconcile is the shared read path for Progress and Close: load what was
// expected on the shelf, load every scan recorded so far, resolve the
// copies those scans matched, and run the pure domain.DiffStocktake.
func (s *Service) reconcile(ctx context.Context, tenantID, stocktakeID uuid.UUID) (domain.StocktakeResult, error) {
	expected, err := s.repo.ListCopiesForStocktake(ctx, tenantID)
	if err != nil {
		return domain.StocktakeResult{}, err
	}
	scans, err := s.repo.ListStocktakeScans(ctx, tenantID, stocktakeID)
	if err != nil {
		return domain.StocktakeResult{}, err
	}

	byID := make(map[uuid.UUID]domain.Copy, len(expected))
	for _, c := range expected {
		byID[c.ID] = c
	}
	var missingIDs []uuid.UUID
	for _, sc := range scans {
		if sc.Outcome == domain.ScanFound && sc.CopyID.Valid {
			if _, ok := byID[sc.CopyID.UUID]; !ok {
				missingIDs = append(missingIDs, sc.CopyID.UUID)
			}
		}
	}
	resolved := make(map[uuid.UUID]domain.Copy, len(byID))
	for k, v := range byID {
		resolved[k] = v
	}
	if len(missingIDs) > 0 {
		extra, err := s.repo.GetCopiesByIDs(ctx, tenantID, missingIDs)
		if err != nil {
			return domain.StocktakeResult{}, err
		}
		for _, c := range extra {
			resolved[c.ID] = c
		}
	}

	records := make([]domain.ScanRecord, 0, len(scans))
	for _, sc := range scans {
		rec := domain.ScanRecord{Scan: sc}
		if sc.CopyID.Valid {
			rec.Copy = resolved[sc.CopyID.UUID]
		}
		records = append(records, rec)
	}
	return domain.DiffStocktake(expected, records), nil
}

// Close ends a stocktake session, reconciles the shelf, persists the
// missing/unexpected/misplaced copies so the result survives after the
// page is closed, and optionally marks copies that were never scanned as
// lost or unknown.
func (s *Service) Close(ctx context.Context, tenantID, stocktakeID uuid.UUID, notes string, markMissingAs domain.MarkMissingAs, actorUserID uuid.UUID) (domain.StocktakeResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.StocktakeResult{}, err
	}
	if !markMissingAs.Valid() {
		return domain.StocktakeResult{}, domain.ErrInvalidInput
	}
	if markMissingAs == "" {
		markMissingAs = domain.MarkMissingAsNone
	}
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
		result, err = s.reconcile(ctx, tenantID, stocktakeID)
		if err != nil {
			return err
		}
		if err := s.repo.InsertStocktakeResults(ctx, tenantID, stocktakeID, result); err != nil {
			return err
		}
		if markMissingAs != domain.MarkMissingAsNone {
			newStatus := domain.CopyLost
			if markMissingAs == domain.MarkMissingAsUnknown {
				newStatus = domain.CopyUnknown
			}
			for _, c := range result.Missing {
				if _, err := s.repo.UpdateCopyStatus(ctx, tenantID, c.ID, newStatus, nil); err != nil {
					return err
				}
				if err := s.repo.CreateItemEvent(ctx, domain.ItemEvent{
					TenantID: tenantID, CopyID: c.ID, EventType: domain.ItemEventStocktake,
					FromStatus: string(c.Status), ToStatus: string(newStatus),
					Note: "stocktake " + st.Name, ActorUserID: uuid.NullUUID{UUID: actorUserID, Valid: actorUserID != uuid.Nil},
				}); err != nil {
					return err
				}
			}
		}
		_, _, err = s.repo.CloseStocktake(ctx, tenantID, stocktakeID, s.clock.Now(), notes, result, markMissingAs)
		return err
	})
	return result, err
}

// StocktakeResults returns the persisted per-copy reconciliation for a
// closed session (or a live one, recomputed on the fly), for the results
// screen and the XLSX report.
func (s *Service) StocktakeResults(ctx context.Context, tenantID, stocktakeID uuid.UUID) (domain.StocktakeResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.StocktakeResult{}, err
	}
	var result domain.StocktakeResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		st, err := s.GetStocktake(ctx, tenantID, stocktakeID)
		if err != nil {
			return err
		}
		if st.Status == domain.StocktakeOpen {
			result, err = s.reconcile(ctx, tenantID, stocktakeID)
			return err
		}
		result, err = s.persistedResult(ctx, tenantID, stocktakeID)
		return err
	})
	if err != nil {
		return domain.StocktakeResult{}, err
	}
	return result, nil
}

// persistedResult rebuilds a domain.StocktakeResult from the rows Close
// wrote to library_stocktake_results, for a session that has already
// been closed.
func (s *Service) persistedResult(ctx context.Context, tenantID, stocktakeID uuid.UUID) (domain.StocktakeResult, error) {
	rows, err := s.repo.ListStocktakeResults(ctx, tenantID, stocktakeID)
	if err != nil {
		return domain.StocktakeResult{}, err
	}
	scanned, err := s.repo.CountStocktakeScans(ctx, tenantID, stocktakeID)
	if err != nil {
		return domain.StocktakeResult{}, err
	}
	var result domain.StocktakeResult
	result.ScannedCount = scanned
	for _, row := range rows {
		switch row.Outcome {
		case "missing":
			if row.Copy != nil {
				result.Missing = append(result.Missing, *row.Copy)
			}
		case "unexpected":
			if row.Copy != nil {
				result.Unexpected = append(result.Unexpected, *row.Copy)
			}
		case "misplaced":
			if row.Copy != nil && row.FoundLocationID.Valid {
				result.Misplaced = append(result.Misplaced, domain.MisplacedCopy{Copy: *row.Copy, FoundLocationID: row.FoundLocationID.UUID})
			}
		}
	}
	// The session's expected set isn't stored row-by-row; it's derived
	// from what was actually reconciled at close time: every scan that
	// matched an expected copy, plus every expected copy that was missed.
	result.ExpectedCount = scanned - len(result.Unexpected) + len(result.Missing)
	return result, nil
}

// StocktakeReportXLSX renders one session's reconciliation as a
// spreadsheet: one sheet per outcome (missing, unexpected, misplaced),
// so a librarian can hand the missing list to whoever is chasing down
// the books.
func (s *Service) StocktakeReportXLSX(ctx context.Context, tenantID, stocktakeID uuid.UUID) ([]byte, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	if _, err := s.GetStocktake(ctx, tenantID, stocktakeID); err != nil {
		return nil, err
	}
	result, err := s.StocktakeResults(ctx, tenantID, stocktakeID)
	if err != nil {
		return nil, err
	}

	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // best-effort close after the buffer is written

	headerStyle, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Color: "FFFFFF"}, Fill: excelize.Fill{Type: "pattern", Color: []string{"2563EB"}, Pattern: 1}})
	if err != nil {
		return nil, fmt.Errorf("stocktake report style: %w", err)
	}

	writeCopySheet := func(name string, copies []domain.Copy, locationOf func(domain.Copy) string) error {
		if name != "Sheet1" {
			if _, err := f.NewSheet(name); err != nil {
				return err
			}
		}
		headers := []string{"Nomor Induk", "Barcode", "Nomor Panggil", "Kondisi", "Status", "Lokasi Ditemukan"}
		for i, h := range headers {
			cell, _ := excelize.CoordinatesToCellName(i+1, 1)
			_ = f.SetCellValue(name, cell, h)
			_ = f.SetCellStyle(name, cell, cell, headerStyle)
		}
		for row, c := range copies {
			values := []any{c.AccessionNumber, c.Barcode, c.CallNumber, string(c.Condition), string(c.Status), locationOf(c)}
			for col, v := range values {
				cell, _ := excelize.CoordinatesToCellName(col+1, row+2)
				_ = f.SetCellValue(name, cell, v)
			}
		}
		return f.SetPanes(name, &excelize.Panes{Freeze: true, Split: false, XSplit: 0, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"})
	}

	if err := writeCopySheet("Sheet1", result.Missing, func(domain.Copy) string { return "" }); err != nil {
		return nil, fmt.Errorf("stocktake report missing sheet: %w", err)
	}
	if err := f.SetSheetName("Sheet1", "Hilang"); err != nil {
		return nil, fmt.Errorf("stocktake report rename: %w", err)
	}
	if err := writeCopySheet("Tidak Terduga", result.Unexpected, func(domain.Copy) string { return "" }); err != nil {
		return nil, fmt.Errorf("stocktake report unexpected sheet: %w", err)
	}
	misplacedCopies := make([]domain.Copy, len(result.Misplaced))
	misplacedLocation := make(map[uuid.UUID]string, len(result.Misplaced))
	for i, m := range result.Misplaced {
		misplacedCopies[i] = m.Copy
		misplacedLocation[m.Copy.ID] = m.FoundLocationID.String()
	}
	if err := writeCopySheet("Salah Rak", misplacedCopies, func(c domain.Copy) string { return misplacedLocation[c.ID] }); err != nil {
		return nil, fmt.Errorf("stocktake report misplaced sheet: %w", err)
	}
	f.SetActiveSheet(0)

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, fmt.Errorf("stocktake report write: %w", err)
	}
	return buf.Bytes(), nil
}
