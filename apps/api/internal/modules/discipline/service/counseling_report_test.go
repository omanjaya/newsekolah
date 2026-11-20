package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
)

// TestCounselingReportVars_SchoolClockAndLabels is the regression test for
// the printed counseling report showing the session in UTC ("01:01" for a
// 09:01 WITA session) and the raw codes "individual" and "problem".
func TestCounselingReportVars_SchoolClockAndLabels(t *testing.T) {
	wita, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	note := domain.Counseling{
		SessionAt: time.Date(2026, 11, 20, 1, 1, 0, 0, time.UTC),
		Kind:      domain.CounselingIndividual,
		Topic:     domain.TopicProblem,
	}

	vars := counselingReportVars(note, "Siswa Contoh", "Guru BK Contoh", wita)

	require.Equal(t, "20-11-2026 09:01", vars["session_at"])
	require.Equal(t, "Individu", vars["kind"])
	require.Equal(t, "Masalah", vars["topic"])
}

func TestCounselingReportVars_EarlySessionKeepsItsLocalDate(t *testing.T) {
	wita, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	// 06:30 WITA is still the previous day in UTC.
	note := domain.Counseling{SessionAt: time.Date(2026, 11, 19, 22, 30, 0, 0, time.UTC), Kind: "unknown", Topic: domain.TopicCareer}

	vars := counselingReportVars(note, "", "", wita)

	require.Equal(t, "20-11-2026 06:30", vars["session_at"])
	require.Equal(t, "unknown", vars["kind"], "an unknown code prints as itself")
	require.Equal(t, "Karier", vars["topic"])
}
