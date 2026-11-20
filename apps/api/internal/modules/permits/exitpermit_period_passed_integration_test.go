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

// TestCreateExitPermitRefusesPeriodsThatAlreadyEnded is the regression test
// for a student asking at 11:30 to leave lessons that ended hours earlier:
// the request went up the approval chain and its gate scan would have
// marked those past periods D. seedRealtimeWorld's periods run 07:00-08:00
// and 08:00-09:00 in Asia/Jakarta.
func TestCreateExitPermitRefusesPeriodsThatAlreadyEnded(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-past-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 0, 3)
	at := func(day, hour, minute int) context.Context {
		return clock.WithTime(ctx, time.Date(base.Year(), base.Month(), base.Day()+day, hour, minute, 0, 0, loc))
	}
	request := func(ctx context.Context) error {
		_, _, err := svc.CreateExitPermit(ctx, service.CreateExitPermitInput{
			TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Ke bank",
			StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
		})
		return err
	}

	t.Run("the whole window is over", func(t *testing.T) {
		require.ErrorIs(t, request(at(0, 11, 30)), domain.ErrExitPermitPeriodPassed)
	})

	t.Run("the first lesson ended at the minute it is asked", func(t *testing.T) {
		require.ErrorIs(t, request(at(0, 8, 0)), domain.ErrExitPermitPeriodPassed)
	})

	// Before the accepted request below: a student holds one in-progress
	// exit permit at a time, and the desk record completes at once.
	t.Run("the desk record writes down an exit as it happens", func(t *testing.T) {
		_, err := svc.RecordExitPermitByStaff(at(1, 11, 30), service.RecordExitPermitByStaffInput{
			TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
			StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID, RecordedBy: w.dutyTeacherID,
		})
		require.NoError(t, err)
	})

	t.Run("the first lesson is still running", func(t *testing.T) {
		require.NoError(t, request(at(2, 7, 59)))
	})
}

// TestIssueGateTokenRefusesAfterThePermitWindow covers the gate QR of an
// approved permit asked for once its last period is over: it used to fall
// back to a short-lived token whose scan marked the whole past window D.
func TestIssueGateTokenRefusesAfterThePermitWindow(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "gate-past-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 0, 3)
	morning := clock.WithTime(ctx, time.Date(base.Year(), base.Month(), base.Day(), 7, 10, 0, 0, loc))
	instID, _ := runExitPermitToGate(t, morning, svc, w)

	afterWindow := clock.WithTime(ctx, time.Date(base.Year(), base.Month(), base.Day(), 9, 0, 0, 0, loc))
	_, err = svc.IssueGateToken(afterWindow, w.tenantID, instID, w.studentID)
	require.ErrorIs(t, err, domain.ErrExitPermitPeriodPassed)
}
