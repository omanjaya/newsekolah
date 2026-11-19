package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestListMyExitPermitsCarriesDestinationAndExit proves a student's own
// exit permit history says where each permit went and, once the gate was
// scanned, when the student left, so a history row needs no detail fetch.
func TestListMyExitPermitsCarriesDestinationAndExit(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "my-exit-"+uuid.NewString())

	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 0, 3)
	dayOne := time.Date(base.Year(), base.Month(), base.Day(), 7, 10, 0, 0, loc)
	dayTwo := dayOne.AddDate(0, 0, 1)

	// Day one: through the gate at 08:20.
	exitedID, gateToken := runExitPermitToGate(t, clock.WithTime(ctx, dayOne), svc, w)
	exitedAt := time.Date(dayOne.Year(), dayOne.Month(), dayOne.Day(), 8, 20, 0, 0, loc)
	_, err = svc.GateScan(clock.WithTime(ctx, exitedAt), w.tenantID, exitedID, w.dutyTeacherID, gateToken)
	require.NoError(t, err)

	// Day two: requested, still on its way.
	open, _, err := svc.CreateExitPermit(clock.WithTime(ctx, dayTwo), service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Rumah",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err)

	items, err := svc.ListMyExitPermits(ctx, w.tenantID, w.studentID, 25, 0)
	require.NoError(t, err)
	require.Len(t, items, 2)
	byID := map[uuid.UUID]service.MyExitPermit{}
	for _, it := range items {
		byID[it.Instance.ID] = it
	}

	exited := byID[exitedID]
	require.Equal(t, "Puskesmas", exited.Permit.Destination)
	require.NotNil(t, exited.Permit.ExitedAt)
	require.True(t, exited.Permit.ExitedAt.Equal(exitedAt))
	require.Equal(t, domain.StatusCompleted, exited.Instance.Status)

	pending := byID[open.ID]
	require.Equal(t, "Rumah", pending.Permit.Destination)
	require.Nil(t, pending.Permit.ExitedAt)
	require.NotEmpty(t, pending.Definition.Stages, "the stages still label the current one")
}
