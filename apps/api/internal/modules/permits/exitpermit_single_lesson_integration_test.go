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

// TestExitPermitForASingleLesson covers a permit whose range starts and
// ends on the same lesson: the request form defaults the end to the start,
// and during the day's last lesson that is the only range it can offer,
// yet the API refused it with PERIOD_RANGE_INVALID.
func TestExitPermitForASingleLesson(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-single-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 0, 3)
	at := func(day, hour, minute int) context.Context {
		return clock.WithTime(ctx, time.Date(base.Year(), base.Month(), base.Day()+day, hour, minute, 0, 0, loc))
	}

	_, permit, err := svc.CreateExitPermit(at(0, 8, 10), service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Ke bank",
		StartPeriodID: w.endPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err)
	require.Equal(t, permit.StartPeriodID, permit.EndPeriodID)

	_, _, err = svc.CreateExitPermit(at(1, 7, 10), service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Ke bank",
		StartPeriodID: w.endPeriodID, EndPeriodID: w.startPeriodID,
	})
	require.ErrorIs(t, err, domain.ErrPeriodRangeInvalid, "a range must not end before it starts")
}
