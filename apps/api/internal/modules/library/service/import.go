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
	// The preview only reads, but it reads tenant tables under row level
	// security, so it needs the tenant transaction like every other read.
	var preview ImportPreview
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		preview, err = s.previewImportRows(ctx, tenantID, rawRows, mapping)
		return err
	})
	return preview, err
}

func (s *Service) previewImportRows(ctx context.Context, tenantID uuid.UUID, rawRows []map[string]any, mapping map[string]string) (ImportPreview, error) {
	refs, err := s.loadImportRefs(ctx, tenantID)
	if err != nil {
		return ImportPreview{}, err
	}

	rows := make([]domain.ImportRow, len(rawRows))
	for i, raw := range rawRows {
		rows[i] = domain.ImportRowFromRaw(raw, mapping)
	}
	codes, err := s.importCopyCodeCheck(ctx, tenantID, rows)
	if err != nil {
		return ImportPreview{}, err
	}

	preview := ImportPreview{Rows: make([]ImportPreviewRow, 0, len(rows))}
	for _, row := range rows {
		copies, message, ok := domain.ValidateImportRow(row, refs.validation)
		if ok {
			message, ok = codes.check(row, copies)
		}
		if !ok {
			preview.Summary.Errors++
			preview.Rows = append(preview.Rows, ImportPreviewRow{RowNumber: row.RowNumber, Status: "error", Message: message, Title: row.Title})
			continue
		}
		_, found, err := s.findDedupeTitle(ctx, tenantID, row.ISBN, row.Title, row.Author)
		if err != nil {
			return ImportPreview{}, err
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

// importCopyCodes is what an import preview knows about the explicit
// barcodes and accession numbers in a file: which ones copies already on
// file hold, and which ones an earlier row of the same file claimed.
type importCopyCodes struct {
	takenBarcodes, takenAccessions map[string]bool
	seenBarcodes, seenAccessions   map[string]int
	// barcodeFromAccession is true when the tenant prints the accession
	// number as the barcode, so a row with only a No. Induk also claims
	// that value as its barcode.
	barcodeFromAccession bool
}

// importCopyNumbers is the barcode and accession number a row's single
// copy would be saved with, when the row sets them. A row creating more
// than one copy always generates both (see CommitImport).
func (c importCopyCodes) importCopyNumbers(row domain.ImportRow, copies int) (barcode, accession string) {
	if copies != 1 {
		return "", ""
	}
	barcode, accession = strings.TrimSpace(row.Barcode), strings.TrimSpace(row.AccessionNumber)
	if barcode == "" && c.barcodeFromAccession {
		barcode = accession
	}
	return barcode, accession
}

// importCopyCodeCheck looks up, in one query, every explicit barcode and
// accession number the file carries, so the preview can flag a row whose
// number is already taken instead of letting the commit fail the whole
// file (old app: the commit's unique violation was the first anyone heard
// of it).
func (s *Service) importCopyCodeCheck(ctx context.Context, tenantID uuid.UUID, rows []domain.ImportRow) (importCopyCodes, error) {
	codes := importCopyCodes{
		seenBarcodes: map[string]int{}, seenAccessions: map[string]int{},
		barcodeFromAccession: s.librarySettings(ctx, tenantID).BarcodeSource != "sequence",
	}
	var barcodes, accessions []string
	for _, row := range rows {
		barcode, accession := codes.importCopyNumbers(row, 1)
		if barcode != "" {
			barcodes = append(barcodes, barcode)
		}
		if accession != "" {
			accessions = append(accessions, accession)
		}
	}
	var err error
	codes.takenBarcodes, codes.takenAccessions, err = s.repo.TakenCopyCodes(ctx, tenantID, barcodes, accessions)
	return codes, err
}

// check reports a row whose barcode or accession number is already used
// by a copy on file or by an earlier row of the same file, and otherwise
// records the row's numbers as claimed.
func (c importCopyCodes) check(row domain.ImportRow, copies int) (string, bool) {
	barcode, accession := c.importCopyNumbers(row, copies)
	switch {
	case accession != "" && c.takenAccessions[accession]:
		return "No. induk " + accession + " sudah dipakai eksemplar lain.", false
	case barcode != "" && c.takenBarcodes[barcode]:
		return "Barcode " + barcode + " sudah dipakai eksemplar lain.", false
	case accession != "" && c.seenAccessions[accession] > 0:
		return "No. induk " + accession + " sudah dipakai di baris " + strconv.Itoa(c.seenAccessions[accession]) + ".", false
	case barcode != "" && c.seenBarcodes[barcode] > 0:
		return "Barcode " + barcode + " sudah dipakai di baris " + strconv.Itoa(c.seenBarcodes[barcode]) + ".", false
	}
	if accession != "" {
		c.seenAccessions[accession] = row.RowNumber
	}
	if barcode != "" {
		c.seenBarcodes[barcode] = row.RowNumber
	}
	return "", true
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
// business-rule guard clauses gate one write or one aggregated read;
// the branches are sequential guards, not nested decision logic, and
// the module's existing test suite already covers them. Left as-is
// here to avoid behaviour risk in a lint-only change.
//
//nolint:gocyclo // service method: several independent precondition/authorization/
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
		for _, v := range importCommitOrder(rawRows, mapping, refs.validation) {
			row, copies := v.row, v.copies
			title, found, err := s.findDedupeTitle(ctx, tenantID, row.ISBN, row.Title, row.Author)
			if err != nil {
				return err
			}
			if !found {
				materialTypeID := refs.materialTypeIDs[strings.ToLower(row.MaterialTypeCode)]
				// Imported titles are public, like a title entered by hand
				// (the create endpoint defaults is_opac to true); leaving the
				// Go zero value hid every imported title from the OPAC.
				newTitle, err := prepareTitle(domain.Title{
					TenantID: tenantID, Title: strings.TrimSpace(row.Title), Author: row.Author, Publisher: row.Publisher,
					PublishPlace: row.PublishPlace, PublishYear: atoiOrZero(row.PublishYear), ISBN: row.ISBN, DDCNumber: row.DDC,
					Subjects: row.Subjects, CallNumber: row.CallNumber, MaterialTypeID: uuid.NullUUID{UUID: materialTypeID, Valid: materialTypeID != uuid.Nil},
					IsOPAC: true,
				})
				if err != nil {
					return &domain.ImportRowError{Row: row.RowNumber, Err: err}
				}
				title, err = s.repo.CreateTitle(ctx, newTitle)
				if err != nil {
					return &domain.ImportRowError{Row: row.RowNumber, Err: err}
				}
				result.CreatedTitles++
			}

			defaults := CopyDefaults{
				CategoryID: uuid.NullUUID{UUID: refs.categoryIDs[strings.ToLower(row.CategoryCode)], Valid: refs.categoryIDs[strings.ToLower(row.CategoryCode)] != uuid.Nil},
				Access:     domain.CopyAccess(row.Access), Price: atoiOrZero(row.Price), CallNumber: row.CallNumber,
				IsOPAC: true,
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
					return &domain.ImportRowError{Row: row.RowNumber, Err: err}
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

// validImportRow is a row that passed validation, with the number of
// copies it creates.
type validImportRow struct {
	row    domain.ImportRow
	copies int
}

// importCommitOrder returns the valid rows in the order the commit creates
// them: rows that type their own No. Induk or barcode first, then the rows
// that draw theirs from the sequence, each group in file order. A typed
// number that collides is final while a drawn one is retried with the next,
// so in file order a drawn number could take the very number a later row
// typed and roll back a file the preview passed; drawing last lets every
// generated number step past the typed ones.
func importCommitOrder(rawRows []map[string]any, mapping map[string]string, refs domain.ImportValidationRefs) []validImportRow {
	typed := make([]validImportRow, 0, len(rawRows))
	var drawn []validImportRow
	for _, raw := range rawRows {
		row := domain.ImportRowFromRaw(raw, mapping)
		copies, _, ok := domain.ValidateImportRow(row, refs)
		if !ok {
			continue
		}
		v := validImportRow{row: row, copies: copies}
		if copies == 1 && (strings.TrimSpace(row.AccessionNumber) != "" || strings.TrimSpace(row.Barcode) != "") {
			typed = append(typed, v)
		} else {
			drawn = append(drawn, v)
		}
	}
	return append(typed, drawn...)
}

func atoiOrZero(s string) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return 0
	}
	return n
}
