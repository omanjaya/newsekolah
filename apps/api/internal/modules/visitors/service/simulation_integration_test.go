package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
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

// TestSimulatedFutureDutyHonoredWithinSimulatedWindow proves
// VisitorsHasActiveDuty (readerRole's security/leadership check) reads its
// "today" from the simulated clock: a security duty whose starts_on is
// well into the future is not yet active under the real wall-clock date,
// but becomes active once a request carries a simulated date that falls
// inside the duty's [starts_on, ends_on] window -- the fix
// cross_module.sql's VisitorsHasActiveDuty now documents (sqlc.arg
// ('today') instead of bare current_date).
func TestSimulatedFutureDutyHonoredWithinSimulatedWindow(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	slug := "visitor-duty-sim-" + uuid.NewString()
	tenantID, _, _ := seedVisitorsWorld(t, ctx, pg.AdminPool, slug)

	q := db.New(pg.AdminPool)
	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tenantID, Label: "2026/2027",
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2027, 6, 30, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)

	reporter, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "pelapor-" + slug, PasswordHash: "x", Name: "Pelapor", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	securityReader, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "satpam-" + slug, PasswordHash: "x", Name: "Satpam Duty", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	dutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{
		TenantID: tenantID, Slug: "security", Name: "Satpam", ScopeKind: "school",
	})
	require.NoError(t, err)
	futureStart := time.Now().AddDate(0, 0, 10)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: tenantID, AcademicYearID: year.ID, DutyTypeID: dutyType.ID, UserID: securityReader.ID,
		StartsOn: database.Date(futureStart),
	})
	require.NoError(t, err)

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), schoolModule.Service, nil, nil, nil, nil, nil, clock.Real{})

	incident, err := svc.CreateIncident(ctx, tenantID, reporter.ID, service.IncidentInput{
		OccurredAt: time.Now(), Severity: domain.SeverityLow, Description: "Kejadian test",
	})
	require.NoError(t, err)

	// Without a simulation header, the real wall-clock date is still
	// before starts_on, so the duty is not yet active and securityReader
	// (not the reporter) cannot open the incident.
	_, err = svc.GetIncident(ctx, tenantID, incident.ID, securityReader.ID)
	require.ErrorIs(t, err, domain.ErrIncidentForbidden,
		"the duty starts in the future, so without simulation it must not be active yet")

	// A simulated date inside the (open-ended) window starting at
	// futureStart must honor the duty.
	simCtx := clock.WithTime(ctx, futureStart.AddDate(0, 0, 2))
	_, err = svc.GetIncident(simCtx, tenantID, incident.ID, securityReader.ID)
	require.NoError(t, err, "a simulated date inside the duty's window must be honored")
}
