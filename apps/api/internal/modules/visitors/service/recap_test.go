package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
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

// stubLetterhead is a minimal reportdoc.LetterheadSource, standing in for
// the school module's ReportLetterhead in this test.
type stubLetterhead struct{}

func (stubLetterhead) Letterhead(context.Context, uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error) {
	return &reportdoc.Letterhead{Lines: []string{"SMA Test"}}, nil, nil
}

func TestBuildRecapDocument(t *testing.T) {
	doc := buildRecapDocument("Rekap Kunjungan Bulanan", reportdoc.LocaleID, sampleRecap())

	require.Equal(t, "Rekap Kunjungan Bulanan", doc.Title)
	require.Equal(t, "1 September 2026 s.d. 30 September 2026", doc.Scope[0].Value)
	require.Len(t, doc.Columns, 2)
	require.Len(t, doc.Sections, 2, "overall figures, then incidents by severity")
	require.Len(t, doc.Sections[0].Rows, 3)
	require.Len(t, doc.Sections[1].Rows, 4, "every severity level appears even when its count is zero")
	require.Equal(t, "Rendah", doc.Sections[1].Rows[0][0], "severity shows its Indonesian label, not the raw code")
	require.Equal(t, reportdoc.PageLabel(reportdoc.LocaleID), doc.PageLabelFormat)
	require.Equal(t, reportdoc.EmptyRowsLabelFor(reportdoc.LocaleID), doc.EmptyRowsLabel)
}

func TestExportRecapReport(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	recap := sampleRecap()
	svc := &Service{letterhead: stubLetterhead{}}

	xlsx, err := svc.ExportRecapReport(ctx, tenantID, "Rekap Kunjungan Harian", reportdoc.LocaleID, recap, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, xlsx)

	pdf, err := svc.ExportRecapReport(ctx, tenantID, "Rekap Kunjungan Harian", reportdoc.LocaleID, recap, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, pdf)

	withoutHeader, err := svc.ExportRecapReport(ctx, tenantID, "Rekap Kunjungan Harian", reportdoc.LocaleID, recap, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: false})
	require.NoError(t, err)
	require.Greater(t, len(xlsx), len(withoutHeader), "the letterhead line must add real content to the workbook")

	narrowed, err := svc.ExportRecapReport(ctx, tenantID, "Rekap Kunjungan Harian", reportdoc.LocaleID, recap, reportdoc.Options{
		Format: reportdoc.FormatXLSX, Columns: []reportdoc.ColumnChoice{{Key: "value", Label: "Total"}},
	})
	require.NoError(t, err)
	require.NotEmpty(t, narrowed)

	_, err = svc.ExportRecapReport(ctx, tenantID, "Rekap Kunjungan Harian", reportdoc.LocaleID, recap, reportdoc.Options{
		Format: reportdoc.FormatXLSX, Columns: []reportdoc.ColumnChoice{{Key: "not_a_real_column"}},
	})
	require.ErrorIs(t, err, reportdoc.ErrUnknownColumn)
}
