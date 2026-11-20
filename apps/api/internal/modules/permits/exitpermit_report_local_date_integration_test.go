package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestExitPermitYearlyReportUsesTheSchoolsCalendar is the regression test
// for the yearly report cutting its year at midnight UTC: a permit opened
// at 06:30 on the year's first day in Asia/Jakarta (23:30 UTC the day
// before) fell out of the report. seedRealtimeWorld's year starts on
// 2025-01-01.
func TestExitPermitYearlyReportUsesTheSchoolsCalendar(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-report-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	firstMorning := time.Date(2025, time.January, 1, 6, 30, 0, 0, loc)
	inst, _, err := svc.CreateExitPermit(clock.WithTime(ctx, firstMorning), service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err)

	rows, err := svc.ExitPermitYearlyReportRows(ctx, w.tenantID)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, inst.ID, rows[0].InstanceID)
}
