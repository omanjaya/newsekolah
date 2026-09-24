package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

func TestRenderLibraryReportLoans(t *testing.T) {
	doc := reportdoc.Document{
		Title:   "Laporan Peminjaman",
		Columns: loansReportColumns(),
		Sections: []reportdoc.Section{{
			Name: "Peminjaman",
			Rows: [][]any{
				{"Laskar Pelangi", "Budi", time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 9, 8, 0, 0, 0, 0, time.UTC), nil, "borrowed", 0},
			},
		}},
	}

	xlsx, err := renderLibraryReport(doc, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, xlsx)

	pdf, err := renderLibraryReport(doc, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, pdf)

	_, err = renderLibraryReport(doc, reportdoc.Options{
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
	doc := reportdoc.Document{
		Title:   "Laporan Judul dan Peminjam Terpopuler",
		Columns: mostBorrowedReportColumns(),
		Sections: []reportdoc.Section{
			{Name: "Judul Terpopuler", Rows: [][]any{{"Laskar Pelangi", "Andrea Hirata", 12}}},
			{Name: "Peminjam Teraktif", Rows: [][]any{{"Citra", "X-1", 5}, {"Dewi", "X-2", 3}}},
		},
	}

	xlsx, err := renderLibraryReport(doc, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, xlsx)

	pdf, err := renderLibraryReport(doc, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, pdf)

	narrowed, err := renderLibraryReport(doc, reportdoc.Options{
		Format: reportdoc.FormatXLSX, Title: "Custom",
		Columns: []reportdoc.ColumnChoice{{Key: "name"}, {Key: "loan_count", Label: "Total"}},
	})
	require.NoError(t, err)
	require.NotEmpty(t, narrowed)
}

func TestLibraryReportColumnSets(t *testing.T) {
	require.Len(t, loansReportColumns(), 7)
	require.Len(t, overdueMembersReportColumns(), 3)
	require.Len(t, mostBorrowedReportColumns(), 3)
	require.Len(t, labelCountColumns("Keterangan"), 2)
	require.Len(t, accessionRegisterColumns(), 6)
}
