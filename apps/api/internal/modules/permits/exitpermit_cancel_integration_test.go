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

// TestCancelExitPermit covers two regressions of the student's cancel:
// the cancel event carried no stage key, so the timeline dated the stage
// the permit stopped at by its request time; and a permit whose lessons
// were over (it reads as expired) could still be cancelled, which
// recorded a lapsed permit as the student's own withdrawal.
// seedRealtimeWorld's permit window runs 07:00-09:00 local.
func TestCancelExitPermit(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-cancel-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 0, 3)
	at := func(day, hour, minute int) context.Context {
		return clock.WithTime(ctx, time.Date(base.Year(), base.Month(), base.Day()+day, hour, minute, 0, 0, loc))
	}
	request := func(t *testing.T, ctx context.Context) uuid.UUID {
		t.Helper()
		inst, _, err := svc.CreateExitPermit(ctx, service.CreateExitPermitInput{
			TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Ke bank",
			StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
		})
		require.NoError(t, err)
		return inst.ID
	}

	t.Run("the cancel event belongs to the stage it stopped", func(t *testing.T) {
		instID := request(t, at(0, 7, 10))
		cancelled, err := svc.CancelExitPermit(at(0, 7, 17), w.tenantID, instID, w.studentID)
		require.NoError(t, err)
		require.Equal(t, domain.StatusCancelled, cancelled.Status)

		detail, err := svc.GetExitPermit(at(0, 7, 18), w.tenantID, instID)
		require.NoError(t, err)
		var cancel *domain.Event
		for i := range detail.Events {
			if detail.Events[i].ToStatus == domain.StatusCancelled {
				cancel = &detail.Events[i]
			}
		}
		require.NotNil(t, cancel, "the cancel is recorded as an event")
		require.Equal(t, "duty_teacher", cancel.StageKey)
		require.True(t, cancel.OccurredAt.Equal(time.Date(base.Year(), base.Month(), base.Day(), 7, 17, 0, 0, loc)))
	})

	t.Run("a permit whose lessons are over cannot be cancelled", func(t *testing.T) {
		instID := request(t, at(1, 7, 10))

		_, err := svc.CancelExitPermit(at(1, 9, 0), w.tenantID, instID, w.studentID)
		require.ErrorIs(t, err, domain.ErrExitPermitWindowClosed)

		detail, err := svc.GetExitPermit(at(1, 9, 1), w.tenantID, instID)
		require.NoError(t, err)
		require.Equal(t, domain.StatusInProgress, detail.Instance.Status, "the refused cancel leaves the permit to lapse")
	})

	t.Run("a closed permit answers that it is not in progress", func(t *testing.T) {
		instID := request(t, at(2, 7, 10))
		_, err := svc.CancelExitPermit(at(2, 7, 20), w.tenantID, instID, w.studentID)
		require.NoError(t, err)

		_, err = svc.CancelExitPermit(at(2, 10, 0), w.tenantID, instID, w.studentID)
		require.ErrorIs(t, err, domain.ErrInstanceNotInProgress)
	})
}
