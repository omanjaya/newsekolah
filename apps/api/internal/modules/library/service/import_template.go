package service

import (
	"context"
	"fmt"
	"strconv"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// importTemplateHeaders is the 18-column order the import template offers
// (old app: downloadLibraryItemImportTemplate) -- everything
// domain.ImportFieldDefs lists except call_number, which only a mapped
// import can fill.
var importTemplateHeaders = []string{
	"Judul*", "Pengarang", "Penerbit", "Tempat Terbit", "Tahun", "ISBN", "DDC", "Subjek",
	"Jenis Bahan (kode)", "Kategori (kode)", "Akses", "Lokasi (kode)", "Sumber (kode)",
	"Tanggal Pengadaan", "Harga", "No. Induk", "Barcode", "Jumlah Eksemplar",
}

// importAccessValues is the Akses column's dropdown list -- domain's
// CopyAccess vocabulary spelled out for the sheet.
var importAccessValues = []string{string(domain.AccessLoanable), string(domain.AccessReadInPlace), string(domain.AccessReference)}

// ImportTemplateXLSX builds the collection import template: the 18-column
// entry sheet plus a hidden "Referensi" sheet holding this tenant's
// current master-data codes, with dropdown data validation on every
// coded column pointing at that reference sheet (old app:
// downloadLibraryItemImportTemplate).
func (s *Service) ImportTemplateXLSX(ctx context.Context, tenantID uuid.UUID) ([]byte, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	refs, err := s.loadImportRefs(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after Write cannot meaningfully fail.

	const sheet = "Import Koleksi"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, fmt.Errorf("rename import template sheet: %w", err)
	}
	headerStyle, err := newXLSXHeaderStyle(f)
	if err != nil {
		return nil, fmt.Errorf("import template style: %w", err)
	}
	for i, h := range importTemplateHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(sheet, cell, h)
		_ = f.SetCellStyle(sheet, cell, cell, headerStyle)
	}
	_ = f.SetRowHeight(sheet, 1, 24)
	_ = f.SetColWidth(sheet, "A", "A", 30)
	_ = f.SetColWidth(sheet, "B", "R", 18)
	_ = f.SetPanes(sheet, &excelize.Panes{Freeze: true, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"})

	const refSheet = "Referensi"
	if _, err := f.NewSheet(refSheet); err != nil {
		return nil, fmt.Errorf("add reference sheet: %w", err)
	}

	writeCodes := func(col string, ids map[string]uuid.UUID) int {
		codes := make([]string, 0, len(ids))
		for code := range ids {
			codes = append(codes, code)
		}
		for i, code := range codes {
			_ = f.SetCellValue(refSheet, col+strconv.Itoa(i+2), code)
		}
		return len(codes)
	}
	materialCount := writeCodes("A", refs.materialTypeIDs)
	categoryCount := writeCodes("B", refs.categoryIDs)
	for i, v := range importAccessValues {
		_ = f.SetCellValue(refSheet, "C"+strconv.Itoa(i+2), v)
	}
	locationCount := writeCodes("D", refs.locationIDs)
	sourceCount := writeCodes("E", refs.sourceIDs)

	addValidation := func(cellRange, formula string) {
		dv := excelize.NewDataValidation(true)
		dv.SetSqref(cellRange)
		dv.SetSqrefDropList(formula)
		dv.SetError(excelize.DataValidationErrorStyleStop, "Nilai tidak tersedia", "Pilih nilai dari dropdown template.")
		_ = f.AddDataValidation(sheet, dv)
	}
	if materialCount > 0 {
		addValidation("I2:I1000", fmt.Sprintf("Referensi!$A$2:$A$%d", materialCount+1))
	}
	if categoryCount > 0 {
		addValidation("J2:J1000", fmt.Sprintf("Referensi!$B$2:$B$%d", categoryCount+1))
	}
	addValidation("K2:K1000", fmt.Sprintf("Referensi!$C$2:$C$%d", len(importAccessValues)+1))
	if locationCount > 0 {
		addValidation("L2:L1000", fmt.Sprintf("Referensi!$D$2:$D$%d", locationCount+1))
	}
	if sourceCount > 0 {
		addValidation("M2:M1000", fmt.Sprintf("Referensi!$E$2:$E$%d", sourceCount+1))
	}
	_ = f.SetSheetVisible(refSheet, false)
	f.SetActiveSheet(0)

	return writeXLSXBuffer(f)
}
