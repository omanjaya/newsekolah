package service

import (
	"bytes"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

func sampleTeacherCycleReport() TeacherCycleReport {
	cycle := domain.SupervisionCycle{
		ID:   uuid.New(),
		Name: "Siklus Ganjil 2026/2027",
		Instrument: domain.Instrument{
			Name: "Instrumen Supervisi", ScaleMin: 1, ScaleMax: 4,
			Criteria: []domain.Criterion{
				{Key: "penguasaan_materi", Name: "Penguasaan Materi"},
				{Key: "pengelolaan_kelas", Name: "Pengelolaan Kelas"},
			},
		},
	}
	observations := []domain.Observation{
		{
			ObserverUserID: uuid.New(), ObservedAt: time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC),
			Scores:        []domain.CriterionScore{{CriterionKey: "penguasaan_materi", Score: 3}, {CriterionKey: "pengelolaan_kelas", Score: 4}},
			ObserverNotes: "Baik", TeacherResponse: "Terima kasih", AgreedFollowUp: "Lanjutkan",
		},
		{
			ObserverUserID: uuid.New(), ObservedAt: time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC),
			Scores: []domain.CriterionScore{{CriterionKey: "penguasaan_materi", Score: 4}, {CriterionKey: "pengelolaan_kelas", Score: 4}},
		},
	}
	return buildTeacherCycleReport(uuid.New(), "Bu Siti", cycle, observations)
}

func TestBuildTeacherReportDocument(t *testing.T) {
	report := sampleTeacherCycleReport()
	now := time.Date(2026, 9, 24, 0, 0, 0, 0, time.UTC)

	doc := buildTeacherReportDocument(report, "Pak Budi", now, reportdoc.LocaleID)

	require.Equal(t, "Laporan Supervisi Guru", doc.Title)
	require.Len(t, doc.Columns, 7, "date + 2 criteria + average + 3 free-text fields")
	require.Equal(t, "criterion_penguasaan_materi", doc.Columns[1].Key)
	require.Equal(t, "Penguasaan Materi", doc.Columns[1].Label)
	require.Len(t, doc.Sections, 1)
	require.Len(t, doc.Sections[0].Rows, 2)
	require.NotNil(t, doc.Signature)
	require.Equal(t, reportdoc.FormatDate(reportdoc.LocaleID, now), doc.Signature.Date)
	require.Equal(t, "24 September 2026", doc.Signature.Date)
	require.Len(t, doc.Signature.Signers, 2)
	require.Equal(t, "Pengawas", doc.Signature.Signers[0].RoleLabel)
	require.Equal(t, "Pak Budi", doc.Signature.Signers[0].Name)
	require.Equal(t, "Kepala Sekolah", doc.Signature.Signers[1].RoleLabel)
	require.Empty(t, doc.Signature.Signers[1].Name, "no principal data source yet -- left for the signer to fill in by hand")
	require.Equal(t, reportdoc.PageLabel(reportdoc.LocaleID), doc.PageLabelFormat)
	require.Equal(t, reportdoc.EmptyRowsLabelFor(reportdoc.LocaleID), doc.EmptyRowsLabel)

	xlsx, err := renderReport(doc, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, xlsx)

	pdf, err := renderReport(doc, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true})
	require.NoError(t, err)
	require.NotEmpty(t, pdf)

	_, err = renderReport(doc, reportdoc.Options{
		Format: reportdoc.FormatXLSX, Columns: []reportdoc.ColumnChoice{{Key: "not_a_real_column"}},
	})
	require.ErrorIs(t, err, reportdoc.ErrUnknownColumn)
}

// TestTeacherReportDatesInSchoolZone: an observation at 07.15 WITA is
// stored as 23.15 UTC the day before, and both exports printed that UTC
// day (19/11 for a visit on 20/11). The row now carries the school's
// calendar day, and the XLSX cell holds it as written.
func TestTeacherReportDatesInSchoolZone(t *testing.T) {
	wita, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	report := sampleTeacherCycleReport()
	report.Observations = report.Observations[:1]
	report.Observations[0].ObservedAt = time.Date(2026, 11, 19, 23, 15, 0, 0, time.UTC)
	// 00.30 WITA on 21 November is still 20 November in UTC.
	now := time.Date(2026, 11, 20, 16, 30, 0, 0, time.UTC).In(wita)

	doc := buildTeacherReportDocument(report, "Pak Budi", now, reportdoc.LocaleID)

	date, ok := doc.Sections[0].Rows[0][0].(time.Time)
	require.True(t, ok)
	require.Equal(t, "20/11/2026", date.Format("02/01/2006"))
	require.Equal(t, "21 November 2026", doc.Signature.Date)

	xlsx, err := renderReport(doc, reportdoc.Options{Format: reportdoc.FormatXLSX})
	require.NoError(t, err)
	f, err := excelize.OpenReader(bytes.NewReader(xlsx))
	require.NoError(t, err)
	defer func() { _ = f.Close() }()
	rows, err := f.GetRows(f.GetSheetName(0), excelize.Options{RawCellValue: false})
	require.NoError(t, err)
	found := false
	for _, row := range rows {
		for _, cell := range row {
			if cell == "20/11/2026" {
				found = true
			}
			require.NotEqual(t, "19/11/2026", cell)
		}
	}
	require.True(t, found, "the xlsx shows the school's day: %v", rows)
}

func TestLocalDate(t *testing.T) {
	wita, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	got := localDate(time.Date(2026, 11, 19, 23, 15, 0, 0, time.UTC), wita)
	require.Equal(t, time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC), got)
	require.Equal(t, time.Date(2026, 11, 19, 0, 0, 0, 0, time.UTC), localDate(time.Date(2026, 11, 19, 23, 15, 0, 0, time.UTC), nil))
}
