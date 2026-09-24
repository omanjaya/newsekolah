package service

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

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

	doc := buildTeacherReportDocument(report, "Pak Budi", now)

	require.Equal(t, "Laporan Supervisi Guru", doc.Title)
	require.Len(t, doc.Columns, 7, "date + 2 criteria + average + 3 free-text fields")
	require.Equal(t, "criterion_penguasaan_materi", doc.Columns[1].Key)
	require.Equal(t, "Penguasaan Materi", doc.Columns[1].Label)
	require.Len(t, doc.Sections, 1)
	require.Len(t, doc.Sections[0].Rows, 2)
	require.NotNil(t, doc.Signature)
	require.Equal(t, "24 September 2026", doc.Signature.Date)
	require.Len(t, doc.Signature.Signers, 2)
	require.Equal(t, "Pengawas", doc.Signature.Signers[0].RoleLabel)
	require.Equal(t, "Pak Budi", doc.Signature.Signers[0].Name)
	require.Equal(t, "Kepala Sekolah", doc.Signature.Signers[1].RoleLabel)
	require.Empty(t, doc.Signature.Signers[1].Name, "no principal data source yet -- left for the signer to fill in by hand")

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
