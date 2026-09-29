package attendance

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

func TestSimulatedAttendanceDayAndSaveWindow(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWorld(t, ctx, pg.AdminPool, "simulated-attendance")
	_, err := pg.AdminPool.Exec(ctx, "update tenants set timezone = 'Asia/Makassar' where id = $1", w.tenantID)
	require.NoError(t, err)
	svc := buildService(pg.AppPool).WithClock(clock.Frozen{At: w.today.Add(4 * time.Hour)})
	loc, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	y, m, d := w.yesterday.Date()
	at := time.Date(y, m, d, 6, 45, 0, 0, loc)
	simCtx := clock.WithTime(ctx, at.UTC())

	sessions, err := svc.ListSessions(simCtx, w.tenantID, w.teacherID, service.ListSessionsOptions{CurrentOnly: true})
	require.NoError(t, err)
	require.Len(t, sessions, 1)
	require.Equal(t, w.scheduleYesterdayID, sessions[0].Session.ScheduleID)
	require.Equal(t, at.Format("2006-01-02"), sessions[0].Session.Date.Format("2006-01-02"))
	monitor, err := svc.GetMonitorSnapshot(simCtx, w.tenantID)
	require.NoError(t, err)
	require.True(t, at.Equal(monitor.GeneratedAt))
	require.Equal(t, at.Format("2006-01-02"), monitor.Date.Format("2006-01-02"))

	input := service.SaveEntriesInput{Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "H"}}}
	actor := service.Actor{UserID: w.teacherID}
	_, err = svc.SaveEntries(simCtx, w.tenantID, actor, sessions[0].Session.ID, input)
	require.NoError(t, err)
	_, err = svc.SaveEntries(clock.WithTime(ctx, at.AddDate(0, 0, 10)), w.tenantID, actor, sessions[0].Session.ID, input)
	require.ErrorIs(t, err, domain.ErrSaveWindowClosed)

	actual, err := svc.ListSessions(ctx, w.tenantID, w.teacherID, service.ListSessionsOptions{})
	require.NoError(t, err)
	require.Len(t, actual, 1)
	require.Equal(t, w.scheduleTodayID, actual[0].Session.ScheduleID, "other requests retain their original clock")
}
