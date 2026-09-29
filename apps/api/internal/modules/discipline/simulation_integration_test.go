package discipline

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
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
