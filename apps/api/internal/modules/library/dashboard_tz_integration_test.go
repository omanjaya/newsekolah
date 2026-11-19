package library

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestDashboardCountsTheTenantsCalendarDay proves the dashboard's "today"
// figures and its 30-day series follow the tenant's own time zone, as the
// visits tab's TodayVisitSummary does: a loan at 07:30 WITA (UTC+8) is
// 23:30 UTC the day before, and must still count as today's loan and sit
// on today's date in the chart.
func TestDashboardCountsTheTenantsCalendarDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedSimulatedLibraryWorld(t, ctx, pg.AdminPool, "tz-"+uuid.NewString()[:8])
	_, err := pg.AdminPool.Exec(ctx, `update tenants set timezone = 'Asia/Makassar' where id = $1`, w.tenantID)
	require.NoError(t, err)

	repo := repository.New(pg.AppPool)
	svc := service.New(pg.AppPool, repo, nil, nil, clock.Frozen{At: time.Date(2020, 6, 15, 12, 0, 0, 0, time.UTC)})

	borrowAt := time.Date(2026, 11, 18, 23, 30, 0, 0, time.UTC) // 19 Nov 07:30 WITA
	loan, err := svc.Borrow(clock.WithTime(ctx, borrowAt), w.tenantID, service.BorrowInput{
		Barcode: w.copyBarcode, MemberUserID: w.memberUserID, CheckedOutBy: w.memberUserID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)
	returnAt := borrowAt.Add(15 * time.Minute) // 19 Nov 07:45 WITA
	_, err = svc.Return(clock.WithTime(ctx, returnAt), w.tenantID, service.ReturnInput{
		LoanID: uuid.NullUUID{UUID: loan.ID, Valid: true}, CheckedInBy: w.memberUserID,
	})
	require.NoError(t, err)

	viewAt := time.Date(2026, 11, 19, 9, 28, 0, 0, time.UTC) // 19 Nov 17:28 WITA
	dash, err := svc.Dashboard(clock.WithTime(ctx, viewAt), w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 1, dash.Summary.LoansToday, "a 07:30 local loan is today's loan, not yesterday's UTC one")
	require.Equal(t, 1, dash.Summary.ReturnsToday)

	// The series spans the whole 30-day window ending today, one point per
	// local day, with zeros for days without activity.
	require.Len(t, dash.Series, 30)
	require.Equal(t, "2026-10-21", dash.Series[0].Day)
	last := dash.Series[len(dash.Series)-1]
	require.Equal(t, "2026-11-19", last.Day)
	require.Equal(t, 1, last.Loans)
	require.Equal(t, 1, last.Returns)
	for _, p := range dash.Series[:len(dash.Series)-1] {
		require.Zero(t, p.Loans, "day %s", p.Day)
		require.Zero(t, p.Returns, "day %s", p.Day)
	}

	// The next local day sees none of it as today's.
	nextDay, err := svc.Dashboard(clock.WithTime(ctx, viewAt.Add(24*time.Hour)), w.tenantID)
	require.NoError(t, err)
	require.Zero(t, nextDay.Summary.LoansToday)
	require.Equal(t, "2026-11-19", nextDay.Series[len(nextDay.Series)-2].Day)
	require.Equal(t, 1, nextDay.Series[len(nextDay.Series)-2].Loans)
}
