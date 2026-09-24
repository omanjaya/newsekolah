package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// stubLetterhead is a minimal reportdoc.LetterheadSource, standing in for
// the school module's ReportLetterhead in this test.
type stubLetterhead struct{}

func (stubLetterhead) Letterhead(context.Context, uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error) {
	return &reportdoc.Letterhead{Lines: []string{"SMA Test"}}, nil, nil
}

func TestRenderLibraryReportLoans(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	svc := &Service{letterhead: stubLetterhead{}}
	doc := reportdoc.Document{
		Title:   "Laporan Peminjaman",
		Columns: loansReportColumns(),
		Sections: []reportdoc.Section{{
			Name: "Peminjaman",
			Rows: [][]any{
				{"Laskar Pelangi", "Budi", time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 9, 8, 0, 0, 0, 0, time.UTC), nil, loanStatusLabel(domain.LoanActive), 0},
			},
		}},
	}

	xlsx, err := svc.renderLibraryReport(ctx, tenantID, reportdoc.LocaleID, doc, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, xlsx)

	pdf, err := svc.renderLibraryReport(ctx, tenantID, reportdoc.LocaleID, doc, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, pdf)

	withoutHeader, err := svc.renderLibraryReport(ctx, tenantID, reportdoc.LocaleID, doc, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: false})
	require.NoError(t, err)
	require.Greater(t, len(xlsx), len(withoutHeader), "the letterhead line must add real content to the workbook")

	_, err = svc.renderLibraryReport(ctx, tenantID, reportdoc.LocaleID, doc, reportdoc.Options{
		Format: reportdoc.FormatXLSX, Columns: []reportdoc.ColumnChoice{{Key: "not_a_real_column"}},
	})
	require.ErrorIs(t, err, reportdoc.ErrUnknownColumn)
}

// TestRenderLibraryReportTwoShapeSections exercises the reports whose two
// sections describe different things under one generic column set
// (most-borrowed's titles/borrowers, visits' per-day/per-class, members'
// per-type/per-class): reportdoc.Apply and Render must handle sections
// with a different row count under the same Document.Columns without
// error.
func TestRenderLibraryReportTwoShapeSections(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	svc := &Service{}
	doc := reportdoc.Document{
		Title:   "Laporan Judul dan Peminjam Terpopuler",
		Columns: mostBorrowedReportColumns(),
		Sections: []reportdoc.Section{
			{Name: "Judul Terpopuler", Rows: [][]any{{"Laskar Pelangi", "Andrea Hirata", 12}}},
			{Name: "Peminjam Teraktif", Rows: [][]any{{"Citra", "X-1", 5}, {"Dewi", "X-2", 3}}},
		},
	}

	xlsx, err := svc.renderLibraryReport(ctx, tenantID, reportdoc.LocaleID, doc, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, xlsx)

	pdf, err := svc.renderLibraryReport(ctx, tenantID, reportdoc.LocaleID, doc, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, pdf)

	narrowed, err := svc.renderLibraryReport(ctx, tenantID, reportdoc.LocaleID, doc, reportdoc.Options{
		Format: reportdoc.FormatXLSX, Title: "Custom",
		Columns: []reportdoc.ColumnChoice{{Key: "name"}, {Key: "loan_count", Label: "Total"}},
	})
	require.NoError(t, err)
	require.NotEmpty(t, narrowed)
}

// TestRenderLibraryReportCatalogueSummaryTwoColumnCounts exercises the
// catalogue summary's own shape end to end through the same
// Apply+RenderXLSX/RenderPDF path renderLibraryReport uses: a 2-column
// indicator section and a 3-column DDC breakdown section, sharing one
// Document via reportdoc.Section.Columns (Document.Columns left empty).
func TestRenderLibraryReportCatalogueSummaryTwoColumnCounts(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	svc := &Service{}
	doc := reportdoc.Document{
		Title: catalogueSummaryText(reportdoc.LocaleID, "title"),
		Sections: []reportdoc.Section{
			{
				Name: catalogueSummaryText(reportdoc.LocaleID, "sectionSummary"),
				Columns: []reportdoc.Column{
					{Key: "indicator", Label: "Indikator", Kind: reportdoc.ColumnText},
					{Key: "value", Label: "Nilai", Kind: reportdoc.ColumnText},
				},
				Rows: [][]any{{"Total Judul Aktif", "842"}},
			},
			{
				Name: catalogueSummaryText(reportdoc.LocaleID, "sectionDDC"),
				Columns: []reportdoc.Column{
					{Key: "code", Label: "Kelas DDC", Kind: reportdoc.ColumnText},
					{Key: "name", Label: "Nama", Kind: reportdoc.ColumnText},
					{Key: "count", Label: "Jumlah Judul", Kind: reportdoc.ColumnNumber},
				},
				Rows: [][]any{{"000", "Karya Umum", 42}},
			},
		},
	}

	xlsx, err := svc.renderLibraryReport(ctx, tenantID, reportdoc.LocaleID, doc, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, xlsx)

	pdf, err := svc.renderLibraryReport(ctx, tenantID, reportdoc.LocaleID, doc, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, pdf)
}

func TestCatalogueSummaryTextFallsBackToEnglish(t *testing.T) {
	require.Equal(t, "Ringkasan Katalog", catalogueSummaryText(reportdoc.LocaleID, "title"))
	require.Equal(t, "Catalogue Summary", catalogueSummaryText(reportdoc.LocaleEN, "title"))
	require.Equal(t, "Catalogue Summary", catalogueSummaryText("fr", "title"), "unknown locale falls back to English")
}

func TestLibraryReportColumnSets(t *testing.T) {
	require.Len(t, loansReportColumns(), 7)
	require.Len(t, overdueMembersReportColumns(), 3)
	require.Len(t, mostBorrowedReportColumns(), 3)
	require.Len(t, labelCountColumns("Keterangan"), 2)
	require.Len(t, accessionRegisterColumns(), 6)
}

func TestLibraryReportStatusLabels(t *testing.T) {
	require.Equal(t, "Dipinjam", loanStatusLabel(domain.LoanActive))
	require.Equal(t, "Dikembalikan", loanStatusLabel(domain.LoanReturned))
	require.Equal(t, "Hilang", loanStatusLabel(domain.LoanLost))

	require.Equal(t, "Tersedia", copyStatusLabel(domain.CopyAvailable))
	require.Equal(t, "Rak cadangan", copyStatusLabel(domain.CopyReserveStack))
}

func TestPeriodScope(t *testing.T) {
	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC)

	require.Equal(t, "1 September 2026 s.d. 30 September 2026", periodScope(reportdoc.LocaleID, &from, &to).Value)
	require.Equal(t, "Semua data", periodScope(reportdoc.LocaleID, nil, nil).Value)
}
