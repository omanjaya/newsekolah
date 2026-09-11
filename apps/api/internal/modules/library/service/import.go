package service

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// importMaxRows is the old app's cap on a single import batch
// (library_items.go: 2000 rows per preview/commit call).
const importMaxRows = 2000

// importRefs resolves a collection import's master-data codes to IDs
// (case-insensitive) and, alongside, the lower-cased code sets
// domain.ValidateImportRow checks a row's codes against.
type importRefs struct {
	materialTypeIDs map[string]uuid.UUID
	categoryIDs     map[string]uuid.UUID
	locationIDs     map[string]uuid.UUID
	sourceIDs       map[string]uuid.UUID
	validation      domain.ImportValidationRefs
}

func (s *Service) loadImportRefs(ctx context.Context, tenantID uuid.UUID) (importRefs, error) {
	materialTypes, err := s.repo.ListMaterialTypes(ctx, tenantID)
	if err != nil {
		return importRefs{}, err
	}
	categories, err := s.repo.ListCollectionCategories(ctx, tenantID)
	if err != nil {
		return importRefs{}, err
	}
	locations, err := s.repo.ListLocations(ctx, tenantID)
	if err != nil {
		return importRefs{}, err
	}
	sources, err := s.repo.ListAcquisitionSources(ctx, tenantID)
	if err != nil {
		return importRefs{}, err
	}

	refs := importRefs{
		materialTypeIDs: make(map[string]uuid.UUID, len(materialTypes)),
		categoryIDs:     make(map[string]uuid.UUID, len(categories)),
		locationIDs:     make(map[string]uuid.UUID, len(locations)),
		sourceIDs:       make(map[string]uuid.UUID, len(sources)),
	}
	for _, e := range materialTypes {
		refs.materialTypeIDs[strings.ToLower(e.Code)] = e.ID
	}
	for _, e := range categories {
		refs.categoryIDs[strings.ToLower(e.Code)] = e.ID
	}
	for _, e := range locations {
		refs.locationIDs[strings.ToLower(e.Code)] = e.ID
	}
	for _, e := range sources {
		refs.sourceIDs[strings.ToLower(e.Code)] = e.ID
	}
	refs.validation = domain.ImportValidationRefs{
		MaterialTypeCodes: codeSet(refs.materialTypeIDs), CategoryCodes: codeSet(refs.categoryIDs),
		LocationCodes: codeSet(refs.locationIDs), SourceCodes: codeSet(refs.sourceIDs),
	}
	return refs, nil
}

func codeSet(m map[string]uuid.UUID) map[string]bool {
	out := make(map[string]bool, len(m))
	for k := range m {
		out[k] = true
	}
	return out
}

// ImportPreviewRow is one row's outcome in an import preview.
type ImportPreviewRow struct {
	RowNumber int
	Status    string // "new_title" | "existing_title" | "error"
	Message   string
	Title     string
	Copies    int
}

// ImportPreviewSummary totals an import preview's rows by outcome.
type ImportPreviewSummary struct {
	NewTitles      int
	ExistingTitles int
	Copies         int
	Errors         int
}

type ImportPreview struct {
	Rows    []ImportPreviewRow
	Summary ImportPreviewSummary
}

// findDedupeTitle resolves a row's ISBN/title/author against the
// catalogue: an ISBN match wins over a title+author match when a row's
// FindTitleForDedupe hit both (old app: findExistingBibliographyForImport
// -- ISBN first, then LOWER(title)/LOWER(author)).
func (s *Service) findDedupeTitle(ctx context.Context, tenantID uuid.UUID, isbn, title, author string) (domain.Title, bool, error) {
	normalizedISBN := domain.NormalizeISBN(isbn)
	matches, err := s.repo.FindTitleForDedupe(ctx, tenantID, normalizedISBN, title, author)
	if err != nil {
		return domain.Title{}, false, err
	}
	if len(matches) == 0 {
		return domain.Title{}, false, nil
	}
	if normalizedISBN != "" {
		for _, m := range matches {
			if m.ISBN == normalizedISBN {
				return m, true, nil
			}
		}
	}
	return matches[0], true, nil
}

// PreviewImport validates and dedupe-checks up to 2000 rows without
// writing anything: a row is "error" when domain.ValidateImportRow
// rejects it, "existing_title" when it matches a title already in the
// catalogue (by normalized ISBN, then by title+author), and "new_title"
// otherwise (old app: previewLibraryItemImport).
func (s *Service) PreviewImport(ctx context.Context, tenantID uuid.UUID, rawRows []map[string]any, mapping map[string]string) (ImportPreview, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return ImportPreview{}, err
	}
	if len(rawRows) == 0 || len(rawRows) > importMaxRows {
		return ImportPreview{}, domain.ErrInvalidInput
	}
	refs, err := s.loadImportRefs(ctx, tenantID)
	if err != nil {
		return ImportPreview{}, err
	}

	preview := ImportPreview{Rows: make([]ImportPreviewRow, 0, len(rawRows))}
	for _, raw := range rawRows {
		row := domain.ImportRowFromRaw(raw, mapping)
		copies, message, ok := domain.ValidateImportRow(row, refs.validation)
		if !ok {
			preview.Summary.Errors++
			preview.Rows = append(preview.Rows, ImportPreviewRow{RowNumber: row.RowNumber, Status: "error", Message: message, Title: row.Title})
			continue
		}
		_, found, err := s.findDedupeTitle(ctx, tenantID, row.ISBN, row.Title, row.Author)
		if err != nil {
			preview.Summary.Errors++
			preview.Rows = append(preview.Rows, ImportPreviewRow{RowNumber: row.RowNumber, Status: "error", Message: "Gagal memeriksa judul yang sudah ada.", Title: row.Title})
			continue
		}
		status, message := "new_title", "Judul baru, "+strconv.Itoa(copies)+" eksemplar akan dibuat."
		if found {
			status, message = "existing_title", "Judul sudah ada, "+strconv.Itoa(copies)+" eksemplar akan ditambahkan."
			preview.Summary.ExistingTitles++
		} else {
			preview.Summary.NewTitles++
		}
		preview.Summary.Copies += copies
		preview.Rows = append(preview.Rows, ImportPreviewRow{RowNumber: row.RowNumber, Status: status, Message: message, Title: row.Title, Copies: copies})
	}
	return preview, nil
}

// ImportCommitResult is how many titles and copies a commit created.
type ImportCommitResult struct {
	CreatedTitles int
	CreatedCopies int
}

// CommitImport re-validates every row (the same rules PreviewImport
// applies -- a caller is not trusted to only resubmit rows a prior
// preview accepted) and, for every valid row in one transaction, either
// reuses a deduped existing title or creates a new one (auto call number
// when the row leaves it empty), then creates that row's copies (old
// app: commitLibraryItemImport, createLibraryItemsTx).
func (s *Service) CommitImport(ctx context.Context, tenantID uuid.UUID, rawRows []map[string]any, mapping map[string]string) (ImportCommitResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return ImportCommitResult{}, err
	}
	if len(rawRows) == 0 || len(rawRows) > importMaxRows {
		return ImportCommitResult{}, domain.ErrInvalidInput
	}

	var result ImportCommitResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		refs, err := s.loadImportRefs(ctx, tenantID)
		if err != nil {
			return err
		}
		for _, raw := range rawRows {
			row := domain.ImportRowFromRaw(raw, mapping)
			copies, _, ok := domain.ValidateImportRow(row, refs.validation)
			if !ok {
				continue
			}
			title, found, err := s.findDedupeTitle(ctx, tenantID, row.ISBN, row.Title, row.Author)
			if err != nil {
				return err
			}
			if !found {
				materialTypeID := refs.materialTypeIDs[strings.ToLower(row.MaterialTypeCode)]
				newTitle, err := prepareTitle(domain.Title{
					TenantID: tenantID, Title: strings.TrimSpace(row.Title), Author: row.Author, Publisher: row.Publisher,
					PublishPlace: row.PublishPlace, PublishYear: atoiOrZero(row.PublishYear), ISBN: row.ISBN, DDCNumber: row.DDC,
					Subjects: row.Subjects, CallNumber: row.CallNumber, MaterialTypeID: uuid.NullUUID{UUID: materialTypeID, Valid: materialTypeID != uuid.Nil},
				})
				if err != nil {
					return err
				}
				title, err = s.repo.CreateTitle(ctx, newTitle)
				if err != nil {
					return err
				}
				result.CreatedTitles++
			}

			defaults := CopyDefaults{
				CategoryID: uuid.NullUUID{UUID: refs.categoryIDs[strings.ToLower(row.CategoryCode)], Valid: refs.categoryIDs[strings.ToLower(row.CategoryCode)] != uuid.Nil},
				Access:     domain.CopyAccess(row.Access), Price: atoiOrZero(row.Price), CallNumber: row.CallNumber,
			}
			if id, ok := refs.locationIDs[strings.ToLower(row.LocationCode)]; ok {
				defaults.LocationID = uuid.NullUUID{UUID: id, Valid: true}
			}
			if id, ok := refs.sourceIDs[strings.ToLower(row.SourceCode)]; ok {
				defaults.SourceID = uuid.NullUUID{UUID: id, Valid: true}
			}
			if acquired := strings.TrimSpace(row.AcquiredOn); acquired != "" {
				if t, err := time.Parse("2006-01-02", acquired); err == nil {
					defaults.AcquiredOn = &t
				}
			}
			// An explicit accession number/barcode is only honoured for a
			// single-copy row; a row that creates several copies always
			// auto-generates every number (same rule as AddCopies).
			if copies == 1 {
				defaults.AccessionOverride = strings.TrimSpace(row.AccessionNumber)
				defaults.Barcode = strings.TrimSpace(row.Barcode)
			}

			for i := 0; i < copies; i++ {
				if _, err := s.addCopyTx(ctx, title, defaults); err != nil {
					return err
				}
				result.CreatedCopies++
			}
		}
		return nil
	})
	if err != nil {
		return ImportCommitResult{}, err
	}
	return result, nil
}

func atoiOrZero(s string) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return 0
	}
	return n
}
