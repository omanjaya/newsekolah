package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

// CatalogueExportXLSX is the full-catalogue export (old app:
// library_catalog_v2.go's exportLibraryCatalogXlsx): a Titles sheet with
// every bibliographic field, and a Copies sheet.
func (s *Service) CatalogueExportXLSX(ctx context.Context, tenantID uuid.UUID) ([]byte, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var titles []TitleExportRow
	var copies []CopyExportRow
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		titles, err = s.repo.ListTitlesForExport(ctx, tenantID)
		if err != nil {
			return err
		}
		copies, err = s.repo.ListCopiesForExport(ctx, tenantID)
		return err
	})
	if err != nil {
		return nil, err
	}

	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after Write cannot meaningfully fail.
	headerStyle, err := newXLSXHeaderStyle(f)
	if err != nil {
		return nil, fmt.Errorf("catalogue export style: %w", err)
	}

	titleSheet, err := newSheet(f, "Judul", true)
	if err != nil {
		return nil, err
	}
	titleHeaders := []string{
		"Judul", "Subjudul", "Pernyataan Tanggung Jawab", "Pengarang", "Pengarang Tambahan", "Penerbit",
		"Tempat Terbit", "Tahun", "Edisi", "Halaman", "Ilustrasi", "Dimensi", "ISBN", "ISSN", "DDC",
		"Nomor Panggil", "Klasifikasi", "Subjek", "Bahasa", "Bentuk Karya", "Sasaran Pembaca", "Catatan",
		"Abstrak", "Jenis Bahan (kode)", "Tampil di OPAC", "Jumlah Eksemplar", "Eksemplar Tersedia",
	}
	titleRows := make([][]any, len(titles))
	for i, row := range titles {
		t := row.Title
		year := any(nil)
		if t.PublishYear > 0 {
			year = t.PublishYear
		}
		opac := "Tidak"
		if t.IsOPAC {
			opac = "Ya"
		}
		titleRows[i] = []any{
			t.Title, t.Subtitle, t.Responsibility, t.Author, t.AdditionalAuthors, t.Publisher, t.PublishPlace,
			year, t.Edition, t.Pages, t.Illustration, t.Dimensions, t.ISBN, t.ISSN, t.DDCNumber, t.CallNumber,
			t.Classification, t.Subjects, t.Language, t.LiteraryForm, t.TargetAudience, t.Notes, t.Abstract,
			row.MaterialTypeCode, opac, row.TotalCopies, row.AvailableCopies,
		}
	}
	if err := writeXLSXSheet(f, titleSheet, headerStyle, titleHeaders, titleRows); err != nil {
		return nil, fmt.Errorf("catalogue export titles write: %w", err)
	}

	copySheet, err := newSheet(f, "Eksemplar", false)
	if err != nil {
		return nil, err
	}
	copyHeaders := []string{
		"Nomor Induk", "Barcode", "Judul", "Pengarang", "Nomor Panggil", "Kategori", "Akses", "Lokasi",
		"Status", "Kondisi", "Sumber", "Tanggal Pengadaan", "Harga",
	}
	copyRows := make([][]any, len(copies))
	for i, row := range copies {
		c := row.Copy
		acquired := any(nil)
		if c.AcquiredOn != nil {
			acquired = formatDate(*c.AcquiredOn)
		}
		copyRows[i] = []any{
			c.AccessionNumber, c.Barcode, row.TitleName, row.TitleAuthor, c.CallNumber, row.CategoryName,
			string(c.Access), row.LocationName, string(c.Status), string(c.Condition), row.SourceName, acquired, c.Price,
		}
	}
	if err := writeXLSXSheet(f, copySheet, headerStyle, copyHeaders, copyRows); err != nil {
		return nil, fmt.Errorf("catalogue export copies write: %w", err)
	}
	f.SetActiveSheet(0)
	return writeXLSXBuffer(f)
}
