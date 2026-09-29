package grading

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestSimulatedPublishUsesSimulatedClock proves a report-card publish made
// under a superadmin's simulated business time records "published on" as
// the simulated instant, not the server's real clock: the timestamp is a
// business fact students and parents read (docs/testing-time-simulation.md's
// "Cakupan"), not bookkeeping. A request without the simulation header
// keeps using the real (here, frozen) fallback clock, the same isolation
// attendance's own simulation test proves.
func TestSimulatedPublishUsesSimulatedClock(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	gradingModule := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}})
	// Pin the service's fallback ("real") clock to a year far from the
	// simulated instant below, so a match can only come from the
	// request's simulated context.
	realClock := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	gradingModule.Service.WithClock(clock.Frozen{At: realClock})

	simulated := time.Date(2027, 3, 5, 9, 30, 0, 0, time.UTC)
	simCtx := clock.WithTime(ctx, simulated)

	out, err := gradingModule.Service.Publish(simCtx, fx.tenantID, fx.teacherID, true, fx.classID, fx.subjectID,
		uuid.NullUUID{UUID: fx.termID, Valid: true}, true)
	require.NoError(t, err)
	require.NotNil(t, out.PublishedAt)
	require.True(t, simulated.Equal(*out.PublishedAt), "published_at must equal the simulated clock, got %v", out.PublishedAt)

	// Unpublish then republish without the simulation header: both fall
	// back to the frozen "real" clock, proving requests are isolated.
	_, err = gradingModule.Service.Publish(ctx, fx.tenantID, fx.teacherID, true, fx.classID, fx.subjectID,
		uuid.NullUUID{UUID: fx.termID, Valid: true}, false)
	require.NoError(t, err)

	out2, err := gradingModule.Service.Publish(ctx, fx.tenantID, fx.teacherID, true, fx.classID, fx.subjectID,
		uuid.NullUUID{UUID: fx.termID, Valid: true}, true)
	require.NoError(t, err)
	require.NotNil(t, out2.PublishedAt)
	require.True(t, realClock.Equal(*out2.PublishedAt), "a request without the simulation header must keep the real fallback clock")
}
