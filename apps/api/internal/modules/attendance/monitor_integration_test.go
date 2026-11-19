package attendance

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestMonitorSnapshotNamesBellPeriodWithoutSchedules covers a school that
// has set its bell times but not entered a timetable yet: no schedule
// occurrence supplies the running period, so the snapshot resolves it from
// the period template assigned to today and every class shows as
// no_schedule.
func TestMonitorSnapshotNamesBellPeriodWithoutSchedules(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWorld(t, ctx, pg.AdminPool, "monitor-bell-period")
	svc := buildService(pg.AppPool)
	at := w.today.Add(10 * time.Hour)
	simCtx := clock.WithTime(ctx, at)

	_, err := pg.AdminPool.Exec(ctx, `delete from schedules where tenant_id = $1`, w.tenantID)
	require.NoError(t, err)

	// No template assigned to today yet: no bell period either.
	snapshot, err := svc.GetMonitorSnapshot(simCtx, w.tenantID)
	require.NoError(t, err)
	require.Nil(t, snapshot.CurrentPeriod)

	_, err = pg.AdminPool.Exec(ctx,
		`insert into period_day_assignments (tenant_id, academic_year_id, day_of_week, template_id)
		 select $1, $2, $3, template_id from periods where id = $4`,
		w.tenantID, w.yearID, domain.IsoWeekday(at), w.periodID,
	)
	require.NoError(t, err)

	snapshot, err = svc.GetMonitorSnapshot(simCtx, w.tenantID)
	require.NoError(t, err)
	require.NotNil(t, snapshot.CurrentPeriod, "the bell schedule's running period must be named")
	require.Equal(t, "P1", snapshot.CurrentPeriod.Name)
	require.True(t, w.today.Add(time.Minute).Equal(snapshot.CurrentPeriod.StartsAt))
	require.True(t, w.today.Add(23*time.Hour+59*time.Minute).Equal(snapshot.CurrentPeriod.EndsAt))
	require.Len(t, snapshot.Sessions, 1)
	require.Equal(t, "no_schedule", snapshot.Sessions[0].Status)
	require.Equal(t, "X-A", snapshot.Sessions[0].ClassName)

	// A break is not a lesson period: the board must not name it as a
	// period whose timetables are missing.
	_, err = pg.AdminPool.Exec(ctx, `update periods set is_break = true where id = $1`, w.periodID)
	require.NoError(t, err)
	snapshot, err = svc.GetMonitorSnapshot(simCtx, w.tenantID)
	require.NoError(t, err)
	require.Nil(t, snapshot.CurrentPeriod, "a break must not be reported as the running lesson period")
	_, err = pg.AdminPool.Exec(ctx, `update periods set is_break = false where id = $1`, w.periodID)
	require.NoError(t, err)

	// Outside every period of the template, there is still no period.
	snapshot, err = svc.GetMonitorSnapshot(clock.WithTime(ctx, w.today), w.tenantID)
	require.NoError(t, err)
	require.Nil(t, snapshot.CurrentPeriod)
}
