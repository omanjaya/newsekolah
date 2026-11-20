package wiring

import (
	"context"
	"errors"
	"net/url"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/domain"
	reportsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestReportScheduleCatchesUpMissedSlot covers a worker that was down at
// the top of the hour: the next wake-up still runs the missed slot (keyed
// on its own due_at), the list shows that slot as the next run until it is
// claimed instead of jumping to tomorrow, a slot older than the catch-up
// window is dropped, and the stored file of a run whose email failed can be
// downloaded from the history.
func TestReportScheduleCatchesUpMissedSlot(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	// 03:10 UTC is 10:10 in the fixture tenant's Asia/Jakarta: the 09:00
	// slot was missed an hour ago, the 05:00 slot five hours ago.
	now := time.Date(2030, 1, 2, 3, 10, 0, 0, time.UTC)

	disciplineReports, _, permitsReports := buildReportsAdapters(pg.AppPool)
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	academicModule := academic.Register(pg.AppPool, clock.Real{})
	svc := reports.Register(reports.Dependencies{
		Pool: pg.AppPool, Discipline: disciplineReports, Permits: permitsReports,
		Storage: &memoryScheduleStorage{}, Clock: clock.Frozen{At: now},
		Academic: AcademicReports{Academic: academicModule.Service, School: schoolModule.Service},
	}).ScheduleService

	fx := seedGradeLevelFixture(t, pg.AdminPool)
	missed := seedDailySchedule(t, pg.AdminPool, fx.tenantID, reportsservice.KindExitPermitsYearly, 9)
	tooOld := seedDailySchedule(t, pg.AdminPool, fx.tenantID, reportsservice.KindExitPermitsYearly, 5)
	missedSlot := time.Date(2030, 1, 2, 2, 0, 0, 0, time.UTC)

	nextRun := func(id uuid.UUID) time.Time {
		t.Helper()
		views, err := svc.ListSchedulesWithNextRun(ctx, fx.tenantID)
		require.NoError(t, err)
		for _, v := range views {
			if v.ID == id {
				return v.NextRunAt
			}
		}
		t.Fatalf("schedule %s not listed", id)
		return time.Time{}
	}
	require.True(t, nextRun(missed).Equal(missedSlot), "the waiting 09:00 slot is the next run, not tomorrow")

	pending, err := svc.RunDueSchedules(ctx)
	require.NoError(t, err)
	require.Len(t, pending, 1)
	require.Equal(t, missed, pending[0].ScheduleID)
	require.Zero(t, runCount(t, pg.AdminPool, tooOld), "a slot older than the catch-up window is dropped")

	runs, err := svc.ListRuns(ctx, fx.tenantID, missed, 10)
	require.NoError(t, err)
	require.Len(t, runs, 1)
	require.True(t, runs[0].DueAt.Equal(missedSlot))
	require.True(t, nextRun(missed).Equal(missedSlot.Add(24*time.Hour)), "once claimed, the next run is tomorrow")

	// A second wake-up in the same hour runs nothing again.
	again, err := svc.RunDueSchedules(ctx)
	require.NoError(t, err)
	require.Empty(t, again)

	// The email failed, but the stored file stays downloadable.
	require.NoError(t, svc.FinalizeRun(ctx, pending[0], errors.New("smtp: 550 mailbox unavailable")))
	link, err := svc.RunDownloadURL(ctx, fx.tenantID, missed, runs[0].ID)
	require.NoError(t, err)
	require.Contains(t, link, "reports/schedules/")
	// Served as an attachment, so the browser downloads it in place.
	parsed, err := url.Parse(link)
	require.NoError(t, err)
	require.Equal(t, reportsservice.XLSXContentType, parsed.Query().Get("response-content-type"))
	require.Equal(t, `attachment; filename="laporan-2030-01-02.xlsx"`,
		parsed.Query().Get("response-content-disposition"))
	_, err = svc.RunDownloadURL(ctx, fx.tenantID, missed, uuid.New())
	require.ErrorIs(t, err, domain.ErrRunNotFound)
}
