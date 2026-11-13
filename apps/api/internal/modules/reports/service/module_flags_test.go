package service_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
)

func TestSourceModuleCoversTheCatalog(t *testing.T) {
	want := map[service.Kind]string{
		service.KindAttendanceDaily:   "",
		service.KindDisciplinePoints:  "discipline",
		service.KindWarningLetters:    "discipline",
		service.KindGradingReport:     "grading",
		service.KindLeaveRequests:     "permits",
		service.KindExitPermitsYearly: "permits",
	}
	for _, def := range service.Catalog() {
		expected, ok := want[def.Kind]
		require.True(t, ok, "catalogue kind %s has no expected source module in this test; add one", def.Kind)
		require.Equal(t, expected, service.SourceModule(def.Kind), def.Kind)
	}
	require.Len(t, service.Catalog(), len(want))
	require.Empty(t, service.SourceModule("unknown.kind"), "an unknown kind reads no toggleable module")
}
