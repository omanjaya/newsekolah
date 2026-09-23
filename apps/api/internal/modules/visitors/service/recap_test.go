package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

func sampleRecap() Recap {
	return Recap{
		From: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), To: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC),
		TotalVisits: 42, StillOnCampus: 3, AvgStayMinutes: 27.5,
		Incidents: map[domain.Severity]int{domain.SeverityLow: 2, domain.SeverityHigh: 1},
	}
}

func TestBuildRecapDocument(t *testing.T) {
	doc := buildRecapDocument("Rekap Kunjungan Bulanan", sampleRecap())

	require.Equal(t, "Rekap Kunjungan Bulanan", doc.Title)
	require.Len(t, doc.Columns, 2)
	require.Len(t, doc.Sections, 2, "overall figures, then incidents by severity")
	require.Len(t, doc.Sections[0].Rows, 3)
	require.Len(t, doc.Sections[1].Rows, 4, "every severity level appears even when its count is zero")
}

func TestExportRecapReport(t *testing.T) {
	recap := sampleRecap()

	xlsx, err := ExportRecapReport("Rekap Kunjungan Harian", recap, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, xlsx)

	pdf, err := ExportRecapReport("Rekap Kunjungan Harian", recap, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, pdf)

	narrowed, err := ExportRecapReport("Rekap Kunjungan Harian", recap, reportdoc.Options{
		Format: reportdoc.FormatXLSX, Columns: []reportdoc.ColumnChoice{{Key: "value", Label: "Total"}},
	})
	require.NoError(t, err)
	require.NotEmpty(t, narrowed)

	_, err = ExportRecapReport("Rekap Kunjungan Harian", recap, reportdoc.Options{
		Format: reportdoc.FormatXLSX, Columns: []reportdoc.ColumnChoice{{Key: "not_a_real_column"}},
	})
	require.ErrorIs(t, err, reportdoc.ErrUnknownColumn)
}
