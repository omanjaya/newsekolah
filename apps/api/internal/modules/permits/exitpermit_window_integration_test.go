package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestExitPermitMarksAttendanceFromTheExitOn is the regression test for a
// gate scan that came after the permit's first lesson: the approval chain
// can outlast that lesson, and the scan used to mark it D although the
// student sat in it. seedRealtimeWorld's periods run 07:00-08:00 and
// 08:00-09:00 in Asia/Jakarta.
func TestExitPermitMarksAttendanceFromTheExitOn(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-window-"+uuid.NewString())
	sync := &fakeAttendanceSync{}
	svc := buildExitPermitServiceWithClock(pg.AppPool, sync, clock.Real{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 0, 3)
	local := func(day, hour, minute int) time.Time {
		return time.Date(base.Year(), base.Month(), base.Day()+day, hour, minute, 0, 0, loc)
	}
	at := func(day, hour, minute int) context.Context {
		return clock.WithTime(ctx, local(day, hour, minute))
	}
	lastCall := func(t *testing.T) forcedStatusCall {
		t.Helper()
		require.NotEmpty(t, sync.calls)
		return sync.calls[len(sync.calls)-1]
	}

	t.Run("a gate scan during the second lesson leaves the first one alone", func(t *testing.T) {
		instID, gate := runExitPermitToGate(t, at(0, 7, 10), svc, w)
		_, err := svc.GateScan(at(0, 8, 30), w.tenantID, instID, w.dutyTeacherID, gate)
		require.NoError(t, err)

		call := lastCall(t)
		require.True(t, call.from.Equal(local(0, 8, 30)), "D starts at the exit, not at 07:00: got %s", call.from)
		require.True(t, call.to.Equal(local(0, 9, 0)), "D still runs to the end of the last lesson")
	})

	t.Run("a gate scan before the first lesson starts marks from its start", func(t *testing.T) {
		instID, gate := runExitPermitToGate(t, at(1, 6, 40), svc, w)
		_, err := svc.GateScan(at(1, 6, 50), w.tenantID, instID, w.dutyTeacherID, gate)
		require.NoError(t, err)

		call := lastCall(t)
		require.True(t, call.from.Equal(local(1, 7, 0)))
		require.True(t, call.to.Equal(local(1, 9, 0)))
	})

	t.Run("the desk record marks from the exit too", func(t *testing.T) {
		_, err := svc.RecordExitPermitByStaff(at(2, 8, 20), service.RecordExitPermitByStaffInput{
			TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
			StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID, RecordedBy: w.dutyTeacherID,
		})
		require.NoError(t, err)

		call := lastCall(t)
		require.True(t, call.from.Equal(local(2, 8, 20)))
		require.True(t, call.to.Equal(local(2, 9, 0)))
	})
}
