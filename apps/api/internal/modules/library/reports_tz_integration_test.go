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

// TestReportsCountTheTenantsCalendarDays proves the period reports read
// their from/to days, per-day series, month bounds and late returns on the
// school's own calendar, as the dashboard and the visits list do. With UTC
// days, activity at 07:30 WITA (UTC+8), which is 23:30 UTC the day before,
// was counted on the previous day and fell out of a period starting that
// day.
func TestReportsCountTheTenantsCalendarDays(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedSimulatedLibraryWorld(t, ctx, pg.AdminPool, "rtz-"+uuid.NewString()[:8])
	_, err := pg.AdminPool.Exec(ctx, `update tenants set timezone = 'Asia/Makassar' where id = $1`, w.tenantID)
	require.NoError(t, err)

	repo := repository.New(pg.AppPool)
	svc := service.New(pg.AppPool, repo, nil, nil, clock.Frozen{At: time.Date(2020, 6, 15, 12, 0, 0, 0, time.UTC)})
	day := func(m time.Month, d int) *time.Time {
		v := time.Date(2026, m, d, 0, 0, 0, 0, time.UTC)
		return &v
	}

	t.Run("visits", func(t *testing.T) {
		record := func(name string, at time.Time) {
			t.Helper()
			_, err := svc.RecordVisit(clock.WithTime(ctx, at), w.tenantID, service.RecordVisitInput{
				VisitorName: name, Kind: domain.VisitNonMember, GroupSize: 1,
			})
			require.NoError(t, err)
		}
		record("before", time.Date(2026, 11, 4, 15, 59, 0, 0, time.UTC))        // 4 Nov 23:59 WITA
		record("first-morning", time.Date(2026, 11, 4, 23, 30, 0, 0, time.UTC)) // 5 Nov 07:30 WITA
		record("last-evening", time.Date(2026, 11, 6, 15, 59, 0, 0, time.UTC))  // 6 Nov 23:59 WITA
		record("after", time.Date(2026, 11, 6, 16, 0, 0, 0, time.UTC))          // 7 Nov 00:00 WITA

		report, err := svc.VisitsReport(ctx, w.tenantID, day(11, 5), day(11, 6))
		require.NoError(t, err)
		require.Equal(t, 2, report.Total, "5-6 Nov on the school's calendar")
		require.Len(t, report.PerDay, 2)
		require.Equal(t, "2026-11-05", report.PerDay[0].Day.Format(time.DateOnly), "a 07:30 local visit sits on its own day")
		require.Equal(t, 1, report.PerDay[0].Count)
		require.Equal(t, "2026-11-06", report.PerDay[1].Day.Format(time.DateOnly))
		require.Equal(t, 1, report.PerDay[1].Count)
		require.Len(t, report.PerClass, 1)
		require.Equal(t, 2, report.PerClass[0].Count)

		// With no "to", the period ends on the school's today: at 00:30 WITA
		// on 7 Nov (16:30 UTC on 6 Nov) the midnight visit is today's.
		viewAt := time.Date(2026, 11, 6, 16, 30, 0, 0, time.UTC)
		report, err = svc.VisitsReport(clock.WithTime(ctx, viewAt), w.tenantID, nil, nil)
		require.NoError(t, err)
		require.Equal(t, 4, report.Total)
		last := report.PerDay[len(report.PerDay)-1]
		require.Equal(t, "2026-11-07", last.Day.Format(time.DateOnly))
		require.Equal(t, 1, last.Count)

		summary, err := svc.CatalogueSummary(ctx, w.tenantID, day(11, 5), day(11, 6))
		require.NoError(t, err)
		require.Equal(t, 2, summary.VisitsInPeriod)
	})

	t.Run("loans", func(t *testing.T) {
		borrowAt := time.Date(2026, 10, 31, 23, 30, 0, 0, time.UTC) // 1 Nov 07:30 WITA
		loan, err := svc.Borrow(clock.WithTime(ctx, borrowAt), w.tenantID, service.BorrowInput{
			Barcode: w.copyBarcode, MemberUserID: w.memberUserID, CheckedOutBy: w.memberUserID, Channel: domain.ChannelDesk,
		})
		require.NoError(t, err)
		// 23:30 UTC on the due date is 07:30 WITA the day after: a day late
		// on the school's calendar, on time by the UTC date.
		due := loan.DueOn
		returnAt := time.Date(due.Year(), due.Month(), due.Day(), 23, 30, 0, 0, time.UTC)
		require.Equal(t, time.November, returnAt.Month(), "the return stays inside the reported month")
		_, err = svc.Return(clock.WithTime(ctx, returnAt), w.tenantID, service.ReturnInput{
			LoanID: uuid.NullUUID{UUID: loan.ID, Valid: true}, CheckedInBy: w.memberUserID,
		})
		require.NoError(t, err)

		rows, err := svc.LoansInPeriod(ctx, w.tenantID, day(11, 1), day(11, 1))
		require.NoError(t, err)
		require.Len(t, rows, 1, "a 07:30 local loan on 1 Nov is in a period starting 1 Nov")
		rows, err = svc.LoansInPeriod(ctx, w.tenantID, day(10, 31), day(10, 31))
		require.NoError(t, err)
		require.Empty(t, rows, "nor is it 31 Oct's loan")

		popular, err := svc.PopularReport(ctx, w.tenantID, day(11, 1), day(11, 1), 10)
		require.NoError(t, err)
		require.Len(t, popular.Titles, 1)
		require.Equal(t, 1, popular.Titles[0].LoanCount)
		require.Len(t, popular.Borrowers, 1)
		require.Equal(t, 1, popular.Borrowers[0].LoanCount)

		summary, err := svc.CatalogueSummary(ctx, w.tenantID, day(11, 1), day(11, 1))
		require.NoError(t, err)
		require.Equal(t, 1, summary.LoansInPeriod)

		november, err := svc.MonthlyReport(ctx, w.tenantID, "2026-11")
		require.NoError(t, err)
		require.Equal(t, 1, november.Loans, "the month starts at the school's midnight")
		require.Equal(t, 1, november.Returns)
		require.Equal(t, 1, november.LateReturns, "returned the day after the due date, school time")
		october, err := svc.MonthlyReport(ctx, w.tenantID, "2026-10")
		require.NoError(t, err)
		require.Zero(t, october.Loans)
	})
}
