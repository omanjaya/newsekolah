package domain_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
)

func TestBuildEraporRowsMapsPublishedScores(t *testing.T) {
	scale := domain.DefaultScale()
	score := 92.0
	sources := []domain.EraporSourceRow{
		{
			StudentUserID: uuid.New(), StudentName: "Siti Aminah", NISN: "0051234567",
			SubjectCode: "MTK", SubjectName: "Matematika", SubjectPublished: true, Score: &score,
		},
	}

	export := domain.BuildEraporRows(scale, sources)

	require.Len(t, export.Rows, 1)
	require.Empty(t, export.Skipped)
	require.Equal(t, domain.EraporRow{NISN: "0051234567", SubjectCode: "MTK", Score: 92, Predicate: "A"}, export.Rows[0])
}

func TestBuildEraporRowsReportsMissingNISN(t *testing.T) {
	scale := domain.DefaultScale()
	score := 85.0
	sources := []domain.EraporSourceRow{
		{
			StudentUserID: uuid.New(), StudentName: "Budi Santoso", NISN: "",
			SubjectCode: "MTK", SubjectName: "Matematika", SubjectPublished: true, Score: &score,
		},
	}

	export := domain.BuildEraporRows(scale, sources)

	require.Empty(t, export.Rows, "a student without an NISN cannot be matched by e-Rapor")
	require.Equal(t, []domain.EraporSkip{
		{StudentName: "Budi Santoso", SubjectName: "Matematika", Reason: domain.EraporSkipMissingNISN},
	}, export.Skipped)
}

func TestBuildEraporRowsReportsNoPublishedScore(t *testing.T) {
	scale := domain.DefaultScale()
	sources := []domain.EraporSourceRow{
		{
			// Subject is published overall but this student has no report score yet.
			StudentUserID: uuid.New(), StudentName: "Dewi Lestari", NISN: "0059876543",
			SubjectCode: "IPA", SubjectName: "Ilmu Pengetahuan Alam", SubjectPublished: true, Score: nil,
		},
		{
			// Subject was never published for this class-term at all.
			StudentUserID: uuid.New(), StudentName: "Andi Wijaya", NISN: "0059876544",
			SubjectCode: "IPS", SubjectName: "Ilmu Pengetahuan Sosial", SubjectPublished: false, Score: nil,
		},
	}

	export := domain.BuildEraporRows(scale, sources)

	require.Empty(t, export.Rows, "neither row has a published score to export")
	require.Equal(t, []domain.EraporSkip{
		{StudentName: "Dewi Lestari", SubjectName: "Ilmu Pengetahuan Alam", Reason: domain.EraporSkipNoPublishedScore},
		{StudentName: "Andi Wijaya", SubjectName: "Ilmu Pengetahuan Sosial", Reason: domain.EraporSkipNoPublishedScore},
	}, export.Skipped)
}

func TestBuildEraporRowsNeverDropsARowSilently(t *testing.T) {
	scale := domain.DefaultScale()
	scoreA := 65.0
	sources := []domain.EraporSourceRow{
		{StudentUserID: uuid.New(), StudentName: "A", NISN: "1", SubjectCode: "MTK", SubjectPublished: true, Score: &scoreA},
		{StudentUserID: uuid.New(), StudentName: "B", NISN: "", SubjectCode: "MTK", SubjectPublished: true, Score: &scoreA},
		{StudentUserID: uuid.New(), StudentName: "C", NISN: "3", SubjectCode: "MTK", SubjectPublished: false, Score: nil},
	}

	export := domain.BuildEraporRows(scale, sources)

	require.Len(t, export.Rows, 1)
	require.Len(t, export.Skipped, 2)
	require.Equal(t, len(sources), len(export.Rows)+len(export.Skipped), "every source row is accounted for exactly once")
}

func TestEraporPredicateScalesToTheGradingScale(t *testing.T) {
	scale := domain.Scale{Min: 0, Max: 4, IncreaseMax: 0, RoundDecimal: 2}

	require.Equal(t, "A", domain.EraporPredicate(scale, 3.8))
	require.Equal(t, "B", domain.EraporPredicate(scale, 3.3))
	require.Equal(t, "C", domain.EraporPredicate(scale, 2.9))
	require.Equal(t, "D", domain.EraporPredicate(scale, 1.5))
}
