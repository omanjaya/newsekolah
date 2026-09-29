package discipline

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestSimulatedWarningLetterNumberFollowsSimulatedClock proves a warning
// letter issued under a superadmin's simulated business time is numbered
// with the simulated clock's year, not the server's real clock's year:
// the letter number is a business artifact a family reads (docs/testing-
// time-simulation.md's "Cakupan"), so a testing superadmin must be able
// to see it dated as of the date they are testing. A request without the
// simulation header keeps using the real (here, frozen) fallback clock,
// proving the two are isolated per request the same way attendance's own
// simulation test proves it (simulation_integration_test.go).
func TestSimulatedWarningLetterNumberFollowsSimulatedClock(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedDisciplineFixture(t, pg.AdminPool)
	mod := newTestDisciplineModule(t, pg.AppPool)
	// The service's fallback ("real") clock is pinned to a year that
	// differs from the simulated one below, so a matching year in the
	// issued letter number can only come from the request's simulated
	// context, never from the fallback.
	mod.Service.WithClock(clock.Frozen{At: time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC)})
	ctx := context.Background()

	vt, err := mod.Service.CreateViolationType(ctx, domain.ViolationType{
		TenantID: fx.tenantID, Code: "BLR", Name: "Bolos", Points: 30,
	})
	require.NoError(t, err)

	_, err = mod.Service.RecordViolation(ctx, fx.tenantID, service.RecordInput{
		StudentUserID: fx.studentID, ViolationTypeID: vt.ID,
		OccurredOn: time.Date(2027, 1, 10, 0, 0, 0, 0, time.UTC), ReporterUserID: fx.counselorID,
	})
	require.NoError(t, err)

	simCtx := clock.WithTime(ctx, time.Date(2027, 1, 15, 8, 0, 0, 0, time.UTC))
	letter, err := mod.Service.IssueWarningLetter(simCtx, fx.tenantID, fx.studentID, fx.counselorID, 1)
	require.NoError(t, err)
	require.Contains(t, letter.LetterNumber, "/2027", "letter number must use the simulated clock's year")

	// A second violation crosses SP2's threshold; issuing it without the
	// simulation header must fall back to the real (frozen) clock's year.
	_, err = mod.Service.RecordViolation(ctx, fx.tenantID, service.RecordInput{
		StudentUserID: fx.studentID, ViolationTypeID: vt.ID,
		OccurredOn: time.Date(2027, 1, 20, 0, 0, 0, 0, time.UTC), ReporterUserID: fx.counselorID,
	})
	require.NoError(t, err)

	letter2, err := mod.Service.IssueWarningLetter(ctx, fx.tenantID, fx.studentID, fx.counselorID, 2)
	require.NoError(t, err)
	require.Contains(t, letter2.LetterNumber, "/2025", "a request without the simulation header keeps the real fallback clock's year")
}

// TestSimulatedFutureDutyHonoredWithinSimulatedWindow proves
// DisciplineHasActiveDuty (readerRole's counselor check) reads its "today"
// from the simulated clock: a counselor duty whose starts_on is well into
// the future is not yet active under the real wall-clock date, but becomes
// active once a request carries a simulated date that falls inside the
// duty's [starts_on, ends_on] window -- exactly the fix cross_module.sql's
// DisciplineHasActiveDuty now documents (sqlc.arg('today') instead of bare
// current_date).
func TestSimulatedFutureDutyHonoredWithinSimulatedWindow(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedDisciplineFixture(t, pg.AdminPool)
	mod := newTestDisciplineModule(t, pg.AppPool)

	q := db.New(pg.AdminPool)
	dutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{
		TenantID: fx.tenantID, Slug: "counselor", Name: "Guru BK", ScopeKind: "school",
	})
	require.NoError(t, err)

	futureStart := time.Now().AddDate(0, 0, 10)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, DutyTypeID: dutyType.ID, UserID: fx.counselorID,
		StartsOn: database.Date(futureStart),
	})
	require.NoError(t, err)

	// Without a simulation header, the real wall-clock date is still
	// before starts_on, so the duty is not yet active and the counselor
	// gate refuses.
	_, err = mod.Service.ListBKTeamCounselings(ctx, fx.tenantID, fx.counselorID, "", 10, 0)
	require.ErrorIs(t, err, domain.ErrCounselingForbidden,
		"the duty starts in the future, so without simulation it must not be active yet")

	// A simulated date inside the (open-ended) window starting at
	// futureStart must honor the duty.
	simCtx := clock.WithTime(ctx, futureStart.AddDate(0, 0, 2))
	_, err = mod.Service.ListBKTeamCounselings(simCtx, fx.tenantID, fx.counselorID, "", 10, 0)
	require.NoError(t, err, "a simulated date inside the duty's window must be honored")
}

// TestSimulatedDutyUsesTenantLocalDate proves DisciplineHasActiveDuty
// compares starts_on/ends_on against the tenant's own local calendar day,
// not the bare UTC date Postgres' current_date would have used: a real
// instant of 2026-10-05T23:30:00Z is already 2026-10-06 in Asia/Makassar
// (UTC+8), so a counselor duty starting 2026-10-06 must already be active
// at that simulated instant even though the UTC calendar date is still
// 2026-10-05.
func TestSimulatedDutyUsesTenantLocalDate(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedDisciplineFixture(t, pg.AdminPool)
	mod := newTestDisciplineModule(t, pg.AppPool)

	_, err := pg.AdminPool.Exec(ctx, `update tenants set timezone = $1 where id = $2`, "Asia/Makassar", fx.tenantID)
	require.NoError(t, err)

	q := db.New(pg.AdminPool)
	dutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{
		TenantID: fx.tenantID, Slug: "counselor", Name: "Guru BK", ScopeKind: "school",
	})
	require.NoError(t, err)

	dutyStart := time.Date(2026, 10, 6, 0, 0, 0, 0, time.UTC)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, DutyTypeID: dutyType.ID, UserID: fx.counselorID,
		StartsOn: database.Date(dutyStart),
	})
	require.NoError(t, err)

	// 2026-10-05T23:30:00Z is 2026-10-06T07:30:00+08:00 in Asia/Makassar.
	simCtx := clock.WithTime(ctx, time.Date(2026, 10, 5, 23, 30, 0, 0, time.UTC))
	_, err = mod.Service.ListBKTeamCounselings(simCtx, fx.tenantID, fx.counselorID, "", 10, 0)
	require.NoError(t, err,
		"2026-10-05T23:30:00Z is already 2026-10-06 in the tenant's Asia/Makassar timezone, so the duty starting that day must be active")
}
