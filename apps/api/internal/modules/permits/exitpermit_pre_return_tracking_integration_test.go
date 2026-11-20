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
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/migrator"
)

// TestExitPermitThatExitedBeforeReturnTracking covers a permit whose
// student went through the gate before migration 0140: whether they came
// back is unknown. It keeps return_required = true (it must not read "not
// coming back") with no expected_return_at, and must stay off the gate's
// "not back yet" list and refuse a return record. Migrating down to 0139
// and up again drops and re-adds the return columns, leaving the exited
// row exactly as 0140 finds an old one.
func TestExitPermitThatExitedBeforeReturnTracking(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-pre-0140-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 0, 3)
	at := func(hour, minute int) context.Context {
		return clock.WithTime(ctx, time.Date(base.Year(), base.Month(), base.Day(), hour, minute, 0, 0, loc))
	}

	instID, gate := runExitPermitToGate(t, at(7, 10), svc, w)
	_, err = svc.GateScan(at(7, 30), w.tenantID, instID, w.dutyTeacherID, gate)
	require.NoError(t, err)

	m, err := migrator.New(pg.DSN)
	require.NoError(t, err)
	t.Cleanup(func() { _, _ = m.Close() })
	require.NoError(t, m.Migrate(139))
	require.NoError(t, m.Up())

	detail, err := svc.GetExitPermit(at(9, 30), w.tenantID, instID)
	require.NoError(t, err)
	require.NotNil(t, detail.Permit.ExitedAt)
	require.True(t, detail.Permit.ReturnRequired, "an old exit must not read as a student not coming back")
	require.Nil(t, detail.Permit.ExpectedReturnAt)
	require.False(t, detail.Permit.AwaitingReturn())

	list, err := svc.ListExitPermitsAwaitingReturn(at(9, 30), w.tenantID)
	require.NoError(t, err)
	require.Empty(t, list, "an exit from before return tracking is never listed as still out")

	_, err = svc.RecordExitPermitReturn(at(9, 30), w.tenantID, instID, w.dutyTeacherID)
	require.ErrorIs(t, err, domain.ErrExitPermitNotAwaitingReturn)
}
