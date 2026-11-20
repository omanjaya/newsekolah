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

// TestExitPermitReturnAtTheGate is the regression test for an exit permit
// that never recorded the student's return: after the permit's end time
// the student was still "Sudah keluar" and the gate had no list of who was
// still out. seedRealtimeWorld's permit window ends at 09:00 local.
func TestExitPermitReturnAtTheGate(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-return-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 0, 7)
	at := func(day, hour, minute int) context.Context {
		return clock.WithTime(ctx, time.Date(base.Year(), base.Month(), base.Day()+day, hour, minute, 0, 0, loc))
	}
	awaiting := func(t *testing.T, ctx context.Context) []service.ExitPermitAwaitingReturn {
		t.Helper()
		list, err := svc.ListExitPermitsAwaitingReturn(ctx, w.tenantID)
		require.NoError(t, err)
		return list
	}

	t.Run("the gate lists the student until they are recorded back", func(t *testing.T) {
		instID, gate := runExitPermitToGate(t, at(0, 7, 10), svc, w)

		_, err := svc.RecordExitPermitReturn(at(0, 7, 20), w.tenantID, instID, w.dutyTeacherID)
		require.ErrorIs(t, err, domain.ErrExitPermitNotAwaitingReturn, "a student who has not gone out cannot come back")

		_, err = svc.GateScan(at(0, 7, 30), w.tenantID, instID, w.dutyTeacherID, gate)
		require.NoError(t, err)

		list := awaiting(t, at(0, 9, 30))
		require.Len(t, list, 1)
		require.Equal(t, instID, list[0].InstanceID)
		require.Equal(t, w.studentID, list[0].SubjectUserID)
		require.False(t, list[0].IsOverdue(time.Date(base.Year(), base.Month(), base.Day(), 8, 59, 0, 0, loc)))
		require.True(t, list[0].IsOverdue(time.Date(base.Year(), base.Month(), base.Day(), 9, 30, 0, 0, loc)),
			"half an hour past the 09:00 period end the student is overdue")
		require.Empty(t, awaiting(t, at(1, 9, 30)), "the list covers the school's own today only")

		back, err := svc.RecordExitPermitReturn(at(0, 9, 30), w.tenantID, instID, w.dutyTeacherID)
		require.NoError(t, err)
		require.True(t, back.Permit.ReturnedLate())
		require.Equal(t, w.dutyTeacherID, back.Permit.ReturnSecurityUserID.UUID)
		require.Empty(t, awaiting(t, at(0, 9, 31)))

		_, err = svc.RecordExitPermitReturn(at(0, 9, 40), w.tenantID, instID, w.dutyTeacherID)
		require.ErrorIs(t, err, domain.ErrExitPermitNotAwaitingReturn, "a second record must not move the return time")
	})

	t.Run("a student who goes home is not awaited", func(t *testing.T) {
		inst, permit, err := svc.CreateExitPermit(at(1, 7, 10), service.CreateExitPermitInput{
			TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Pulang, sakit",
			StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID, NoReturn: true,
		})
		require.NoError(t, err)
		require.False(t, permit.ReturnRequired)
		_, err = svc.CancelExitPermit(at(1, 7, 11), w.tenantID, inst.ID, w.studentID)
		require.NoError(t, err)

		detail, err := svc.RecordExitPermitByStaff(at(2, 10, 0), service.RecordExitPermitByStaffInput{
			TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Pulang, sakit",
			StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID, RecordedBy: w.dutyTeacherID, NoReturn: true,
		})
		require.NoError(t, err)
		require.Nil(t, detail.Permit.ExpectedReturnAt)
		require.Empty(t, awaiting(t, at(2, 10, 5)))
		_, err = svc.RecordExitPermitReturn(at(2, 11, 0), w.tenantID, detail.Instance.ID, w.dutyTeacherID)
		require.ErrorIs(t, err, domain.ErrExitPermitNotAwaitingReturn)
	})

	t.Run("the desk record awaits the student like a gate scan", func(t *testing.T) {
		detail, err := svc.RecordExitPermitByStaff(at(3, 7, 40), service.RecordExitPermitByStaffInput{
			TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
			StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID, RecordedBy: w.dutyTeacherID,
		})
		require.NoError(t, err)
		require.NotNil(t, detail.Permit.ExpectedReturnAt)
		require.True(t, detail.Permit.ExpectedReturnAt.Equal(time.Date(base.Year(), base.Month(), base.Day()+3, 9, 0, 0, 0, loc)))
		list := awaiting(t, at(3, 8, 0))
		require.Len(t, list, 1)
		require.Equal(t, detail.Instance.ID, list[0].InstanceID)

		back, err := svc.RecordExitPermitReturn(at(3, 8, 45), w.tenantID, detail.Instance.ID, w.dutyTeacherID)
		require.NoError(t, err)
		require.False(t, back.Permit.ReturnedLate(), "back at 08:45, before the 09:00 period end")
	})
}
