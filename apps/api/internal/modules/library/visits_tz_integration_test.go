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

// TestListVisitsFiltersByTheTenantsCalendarDays proves the visits list
// reads its from/to days on the school's own calendar, as the dashboard
// and TodayVisitSummary do. With UTC days, a visit at 07:30 WITA (UTC+8),
// which is 23:30 UTC the day before, fell out of a range starting that
// day, and one on the morning after the range's last day was counted.
func TestListVisitsFiltersByTheTenantsCalendarDays(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedSimulatedLibraryWorld(t, ctx, pg.AdminPool, "vtz-"+uuid.NewString()[:8])
	_, err := pg.AdminPool.Exec(ctx, `update tenants set timezone = 'Asia/Makassar' where id = $1`, w.tenantID)
	require.NoError(t, err)

	repo := repository.New(pg.AppPool)
	svc := service.New(pg.AppPool, repo, nil, nil, clock.Frozen{At: time.Date(2020, 6, 15, 12, 0, 0, 0, time.UTC)})

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

	day := func(d int) time.Time { return time.Date(2026, 11, d, 0, 0, 0, 0, time.UTC) }
	names := func(visits []domain.Visit) []string {
		out := make([]string, len(visits))
		for i, v := range visits {
			out[i] = v.VisitorName
		}
		return out
	}

	visits, err := svc.ListVisits(ctx, w.tenantID, day(5), day(6), 50, 0)
	require.NoError(t, err)
	require.Equal(t, []string{"last-evening", "first-morning"}, names(visits),
		"5-6 Nov on the school's calendar, newest first")

	visits, err = svc.ListVisits(ctx, w.tenantID, day(7), day(7), 50, 0)
	require.NoError(t, err)
	require.Equal(t, []string{"after"}, names(visits), "local midnight starts the next day")

	_, err = svc.ListVisits(ctx, w.tenantID, day(6), day(5), 50, 0)
	require.ErrorIs(t, err, domain.ErrInvalidInput)
}
