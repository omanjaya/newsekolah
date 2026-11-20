package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestRecapsBucketByTenantLocalDay is the timezone sweep's regression test
// for the security office's recaps: a guest who arrives at 07:30 in
// Asia/Makassar (23:30 UTC the day before) belongs to that local day and
// month, not to the UTC date of the instant. The locally numbered badge
// reads the same local date and time.
func TestRecapsBucketByTenantLocalDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenantID, hostUserID, guardUserID := seedVisitorsWorld(t, ctx, pg.AdminPool, "visitor-tz-"+uuid.NewString())
	_, err := pg.AdminPool.Exec(ctx, `update tenants set timezone = 'Asia/Makassar' where id = $1`, tenantID)
	require.NoError(t, err)

	svc := buildVisitorsServiceWithRealtime(pg.AppPool, nil)
	svc.WithClock(clock.Frozen{At: time.Date(2026, 11, 19, 23, 30, 0, 0, time.UTC)})

	visit, err := svc.CheckIn(ctx, tenantID, guardUserID, service.CheckInInput{
		FullName: "Tamu Pagi", HostUserID: hostUserID, Purpose: "Rapat", IDType: domain.IDTypeNone,
	})
	require.NoError(t, err)
	require.Equal(t, "TAMU-20261120-073000", visit.BadgeNumber)

	day := func(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, time.UTC) }

	local, err := svc.DailyRecap(ctx, tenantID, day(2026, 11, 20))
	require.NoError(t, err)
	require.Equal(t, 1, local.TotalVisits, "a 07:30 local arrival belongs to the school's own day")
	require.Equal(t, "2026-11-20", local.From.Format(time.DateOnly))

	utcDay, err := svc.DailyRecap(ctx, tenantID, day(2026, 11, 19))
	require.NoError(t, err)
	require.Equal(t, 0, utcDay.TotalVisits, "the visit must not land on the UTC date of the instant")

	// 23:30 UTC on 30 November is already 1 December in Asia/Makassar.
	_, err = svc.CheckIn(clock.WithTime(ctx, time.Date(2026, 11, 30, 23, 30, 0, 0, time.UTC)), tenantID, guardUserID, service.CheckInInput{
		FullName: "Tamu Awal Bulan", HostUserID: hostUserID, Purpose: "Antar barang", IDType: domain.IDTypeNone,
	})
	require.NoError(t, err)

	november, err := svc.MonthlyRecap(ctx, tenantID, day(2026, 11, 1))
	require.NoError(t, err)
	require.Equal(t, 1, november.TotalVisits)
	december, err := svc.MonthlyRecap(ctx, tenantID, day(2026, 12, 15))
	require.NoError(t, err)
	require.Equal(t, 1, december.TotalVisits, "the 1 December local arrival belongs to December")
	require.Equal(t, "2026-12-01", december.From.Format(time.DateOnly))
}
