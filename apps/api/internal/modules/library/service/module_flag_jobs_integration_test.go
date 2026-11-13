package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/wiring"
)

// recordingEvents captures every event the library service publishes.
type recordingEvents struct{ events []service.Event }

func (r *recordingEvents) Publish(_ context.Context, evt service.Event) error {
	r.events = append(r.events, evt)
	return nil
}

// readyHoldPastExpiry drives one world to a ready reservation (borrow,
// reserve, return) and moves its hold expiry into the past, so the next
// expiry run would release it.
func readyHoldPastExpiry(t *testing.T, ctx context.Context, svc *service.Service, admin *pgxpool.Pool, w libraryRealtimeWorld, now time.Time) uuid.UUID {
	t.Helper()
	_, err := svc.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: w.copyBarcode, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)
	reservation, err := svc.Reserve(ctx, w.tenantID, w.titleID, w.reserverID)
	require.NoError(t, err)
	_, err = svc.Return(ctx, w.tenantID, service.ReturnInput{Barcode: w.copyBarcode, CheckedInBy: w.borrowerID})
	require.NoError(t, err)
	_, err = admin.Exec(ctx, `update library_reservations set expires_at = $1 where id = $2`, now.Add(-time.Hour), reservation.ID)
	require.NoError(t, err)
	return reservation.ID
}

// activeLoanDueTomorrow adds a second copy to the world and lends it,
// due the day after now, inside the default two-day reminder window.
func activeLoanDueTomorrow(t *testing.T, ctx context.Context, svc *service.Service, admin *pgxpool.Pool, w libraryRealtimeWorld, now time.Time) {
	t.Helper()
	barcode := "BC2-" + uuid.NewString()[:8]
	_, err := admin.Exec(ctx, `insert into library_copies (tenant_id, title_id, barcode, status) values ($1, $2, $3, 'available')`,
		w.tenantID, w.titleID, barcode)
	require.NoError(t, err)
	loan, err := svc.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: barcode, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)
	_, err = admin.Exec(ctx, `update library_loans set due_on = $1 where id = $2`, now.AddDate(0, 0, 1).Format("2006-01-02"), loan.ID)
	require.NoError(t, err)
}

func reservationStatus(t *testing.T, ctx context.Context, admin *pgxpool.Pool, id uuid.UUID) string {
	t.Helper()
	var status string
	require.NoError(t, admin.QueryRow(ctx, `select status from library_reservations where id = $1`, id).Scan(&status))
	return status
}

// TestLibraryJobsSkipTenantsWithLibraryOff runs both periodic library jobs
// over two tenants in one pass: the tenant with library turned off keeps
// its expired hold and gets no due reminder, while the other tenant's hold
// expires and its member is reminded.
func TestLibraryJobsSkipTenantsWithLibraryOff(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	// 07:30 UTC: the reminder job only fires in a tenant's 07:00 hour, and
	// both fixture tenants are on UTC.
	now := time.Date(2030, 3, 4, 7, 30, 0, 0, time.UTC)

	platformSvc := platform.Register(platform.Dependencies{Pool: pg.AppPool, Clock: clock.Real{}, Mode: config.TenancyMulti}).Service
	events := &recordingEvents{}
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, clock.Frozen{At: now}, service.Deps{
		Realtime: &fakeRealtimeHub{}, Events: events,
		Flags: wiring.ModuleFlag{Flags: platformSvc, Module: platformdomain.ModuleLibrary},
	})

	on := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "lib-on-"+uuid.NewString()[:8])
	off := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "lib-off-"+uuid.NewString()[:8])
	onHold := readyHoldPastExpiry(t, ctx, svc, pg.AdminPool, on, now)
	offHold := readyHoldPastExpiry(t, ctx, svc, pg.AdminPool, off, now)
	activeLoanDueTomorrow(t, ctx, svc, pg.AdminPool, on, now)
	activeLoanDueTomorrow(t, ctx, svc, pg.AdminPool, off, now)

	_, err := platformSvc.SetFlag(ctx, off.tenantID, string(platformdomain.ModuleLibrary), false)
	require.NoError(t, err)
	events.events = nil

	expired, err := svc.ExpireReadyReservationsAllTenants(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, expired, "only the tenant with library on has a hold expired")
	require.Equal(t, "expired", reservationStatus(t, ctx, pg.AdminPool, onHold))
	require.Equal(t, "ready", reservationStatus(t, ctx, pg.AdminPool, offHold), "a tenant with library off is left untouched")

	var offCopyStatus string
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select status from library_copies where id = $1`, off.copyID).Scan(&offCopyStatus))
	require.NotEqual(t, "available", offCopyStatus, "the held copy of a tenant with library off is not released")

	notified, err := svc.SendDueRemindersAllTenants(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, notified)
	var reminded []uuid.UUID
	for _, evt := range events.events {
		if reminder, ok := evt.(service.LoanDueReminderEvent); ok {
			reminded = append(reminded, reminder.TenantID)
		}
	}
	require.Equal(t, []uuid.UUID{on.tenantID}, reminded, "only the tenant with library on is reminded")
}
