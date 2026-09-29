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

// TestSimulatedCheckInCheckOutFollowSimulatedClock proves a guard's
// check-in/check-out under a superadmin's simulated business time records
// the visit's arrived_at/departed_at as the simulated instant, not the
// server's real clock, and that the gate board's overdue flag is computed
// against that same simulated "now" -- docs/testing-time-simulation.md's
// "Cakupan" calls this out explicitly ("Scan masuk/pulang pegawai...
// mengikuti zona waktu sekolah", the same principle this module's own
// visitor scan follows). A request without the simulation header keeps
// using the real (here, frozen) fallback clock, the same isolation
// attendance's own simulation test proves.
func TestSimulatedCheckInCheckOutFollowSimulatedClock(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenantID, hostUserID, guardUserID := seedVisitorsWorld(t, ctx, pg.AdminPool, "visitor-sim-"+uuid.NewString())

	svc := buildVisitorsServiceWithRealtime(pg.AppPool, nil)
	// Pin the fallback ("real") clock far from the simulated instants
	// below, so a match can only come from the request's simulated
	// context.
	realClock := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	svc.WithClock(clock.Frozen{At: realClock})

	arrivedAt := time.Date(2027, 6, 1, 7, 0, 0, 0, time.UTC)
	simArrive := clock.WithTime(ctx, arrivedAt)
	visit, err := svc.CheckIn(simArrive, tenantID, guardUserID, service.CheckInInput{
		FullName: "Tamu Simulasi", HostUserID: hostUserID, Purpose: "Rapat", IDType: domain.IDTypeNone,
	})
	require.NoError(t, err)
	require.True(t, arrivedAt.Equal(visit.ArrivedAt), "arrived_at must equal the simulated clock, got %v", visit.ArrivedAt)

	// The board's overdue flag, read 9 simulated hours later (past
	// domain.OverdueAfter), must use that same simulated "now", not the
	// real fallback clock -- which would still show the guest as freshly
	// arrived.
	nineHoursLater := arrivedAt.Add(9 * time.Hour)
	board, err := svc.Board(clock.WithTime(ctx, nineHoursLater), tenantID)
	require.NoError(t, err)
	require.Len(t, board, 1)
	require.True(t, board[0].Overdue, "the board must flag the visit overdue against the simulated now, not the real clock")

	departedAt := arrivedAt.Add(10 * time.Hour)
	updated, err := svc.CheckOut(clock.WithTime(ctx, departedAt), tenantID, visit.ID, guardUserID)
	require.NoError(t, err)
	require.NotNil(t, updated.DepartedAt)
	require.True(t, departedAt.Equal(*updated.DepartedAt), "departed_at must equal the simulated clock, got %v", updated.DepartedAt)

	// A request without the simulation header keeps the real (frozen)
	// clock.
	other, err := svc.CheckIn(ctx, tenantID, guardUserID, service.CheckInInput{
		FullName: "Tamu Lain", HostUserID: hostUserID, Purpose: "Antar barang", IDType: domain.IDTypeNone,
	})
	require.NoError(t, err)
	require.True(t, realClock.Equal(other.ArrivedAt), "a request without the simulation header must keep the real fallback clock")
}
