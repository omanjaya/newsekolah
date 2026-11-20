package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestUnrecordedReturnStaysOnTheGateList covers a student who went out on
// a permit and was never recorded back: the gate's "Belum kembali" list
// covered today only, so the missing return vanished the next morning
// without a trace. It now stays listed, marked unrecorded, for a week, and
// its return can no longer be stamped on a later day than the exit.
func TestUnrecordedReturnStaysOnTheGateList(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-unrecorded-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 0, 10)
	at := func(day, hour, minute int) context.Context {
		return clock.WithTime(ctx, time.Date(base.Year(), base.Month(), base.Day()+day, hour, minute, 0, 0, loc))
	}

	instID, gate := runExitPermitToGate(t, at(0, 7, 10), svc, w)
	_, err = svc.GateScan(at(0, 7, 30), w.tenantID, instID, w.dutyTeacherID, gate)
	require.NoError(t, err)

	for _, day := range []int{1, 7} {
		list, err := svc.ListExitPermitsAwaitingReturn(at(day, 7, 0), w.tenantID)
		require.NoError(t, err)
		require.Len(t, list, 1, "day %d: the missing return is still listed", day)
		require.Equal(t, instID, list[0].InstanceID)
		require.True(t, list[0].Unrecorded, "day %d: the exit day ended without a return on record", day)
	}
	list, err := svc.ListExitPermitsAwaitingReturn(at(8, 7, 0), w.tenantID)
	require.NoError(t, err)
	require.Empty(t, list, "the list looks back a week, not the whole year")

	_, err = svc.RecordExitPermitReturn(at(1, 7, 0), w.tenantID, instID, w.dutyTeacherID)
	require.ErrorIs(t, err, domain.ErrExitPermitNotAwaitingReturn,
		"a return the next morning would be dated a day after the student came back")
}
