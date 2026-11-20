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

// TestGateScanRefusesAPassShownBeforeTheLessonsEnded covers a gate QR
// minted at a simulated 07:30 and scanned at 09:41, after the permit's
// last period (08:00-09:00 in seedRealtimeWorld) ended. The token's expiry
// was the simulated period end measured against the real clock, so it
// stayed valid for months; the gate accepted it and recorded an exit that
// was already late. The gate now applies the period window on the
// business clock, and the token lasts only as long as the lessons have
// left on that clock.
func TestGateScanRefusesAPassShownBeforeTheLessonsEnded(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "gate-stale-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 2, 0)
	at := func(hour, minute int) time.Time {
		return time.Date(base.Year(), base.Month(), base.Day(), hour, minute, 0, 0, loc)
	}

	inst, _, err := svc.CreateExitPermit(clock.WithTime(ctx, at(7, 10)), service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Ke bank",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err)
	for _, approver := range []uuid.UUID{w.dutyTeacherID, w.counselorID} {
		token, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
			TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, ContextID: uuid.NullUUID{UUID: inst.ID, Valid: true}, IssuedByUserID: approver,
		})
		require.NoError(t, err)
		_, err = svc.ExitPermitScan(clock.WithTime(ctx, at(7, 15)), w.tenantID, inst.ID, w.studentID, token.RawValue)
		require.NoError(t, err)
	}

	realBefore := time.Now()
	gate, err := svc.IssueGateToken(clock.WithTime(ctx, at(7, 30)), w.tenantID, inst.ID, w.studentID)
	require.NoError(t, err)
	require.True(t, gate.ExpiresAt.Equal(at(9, 0)), "the pass reads as valid until the last period ends, on the school's clock")

	var stored time.Time
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select expires_at from scan_tokens where id = $1`, gate.Token.ID).Scan(&stored))
	require.WithinDuration(t, realBefore.Add(90*time.Minute), stored, time.Minute,
		"the stored, real-clock expiry is the 90 simulated minutes left, not the real date of the simulated day")

	_, err = svc.GateScan(clock.WithTime(ctx, at(9, 41)), w.tenantID, inst.ID, w.dutyTeacherID, gate.RawValue)
	require.ErrorIs(t, err, domain.ErrExitPermitPeriodPassed)

	out, err := svc.GetExitPermit(ctx, w.tenantID, inst.ID)
	require.NoError(t, err)
	require.Nil(t, out.Permit.ExitedAt, "no exit is recorded")
	require.Equal(t, domain.StatusApproved, out.Instance.Status)
}

// TestExitPermitLeftOpenOnAnEarlierDayDoesNotBlockToday covers a permit
// that never finished on its own day: one left at the duty teacher's stage
// and one approved but never taken through the gate. Under the time
// simulation the expiry job (real clock) never closes them, and an
// approved one it did not close at all, so the student got 409
// WORKFLOW_ALREADY_IN_PROGRESS on every later day, and the desk record
// failed the same way. A permit from an earlier day can no longer be
// approved further or shown at the gate either.
func TestExitPermitLeftOpenOnAnEarlierDayDoesNotBlockToday(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-stale-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 1, 0)
	at := func(day, hour, minute int) context.Context {
		return clock.WithTime(ctx, time.Date(base.Year(), base.Month(), base.Day()+day, hour, minute, 0, 0, loc))
	}
	request := func(ctx context.Context) (domain.Instance, error) {
		inst, _, err := svc.CreateExitPermit(ctx, service.CreateExitPermitInput{
			TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
			StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
		})
		return inst, err
	}
	approve := func(ctx context.Context, instID, approver uuid.UUID) error {
		token, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
			TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, ContextID: uuid.NullUUID{UUID: instID, Valid: true}, IssuedByUserID: approver,
		})
		require.NoError(t, err)
		_, err = svc.ExitPermitScan(ctx, w.tenantID, instID, w.studentID, token.RawValue)
		return err
	}

	// Day 0: a request that waits at the duty teacher's stage all day.
	pending, err := request(at(0, 7, 10))
	require.NoError(t, err)
	_, err = request(at(0, 7, 20))
	require.ErrorIs(t, err, domain.ErrExitPermitAlreadyToday, "one exit permit a day still holds")
	require.ErrorIs(t, approve(at(0, 9, 30), pending.ID, w.dutyTeacherID), domain.ErrExitPermitPeriodPassed,
		"a stage of a permit whose lessons are over is not approved")

	// Day 1: the stale request no longer blocks, and this one is approved
	// but never taken through the gate.
	approved, err := request(at(1, 7, 10))
	require.NoError(t, err, "yesterday's pending permit does not block today's request")
	require.NoError(t, approve(at(1, 7, 15), approved.ID, w.dutyTeacherID))
	require.NoError(t, approve(at(1, 7, 20), approved.ID, w.counselorID))

	// Day 2: neither earlier permit blocks the desk record, and the
	// approved one has no gate pass left to show.
	_, err = svc.IssueGateToken(at(2, 7, 10), w.tenantID, approved.ID, w.studentID)
	require.ErrorIs(t, err, domain.ErrExitPermitPeriodPassed, "yesterday's lessons are over, whatever today's clock says")
	_, err = svc.RecordExitPermitByStaff(at(2, 7, 30), service.RecordExitPermitByStaffInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Pulang",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID, RecordedBy: w.dutyTeacherID,
	})
	require.NoError(t, err, "the desk record is not refused with WORKFLOW_ALREADY_IN_PROGRESS")
}

// TestExpiryClosesAnApprovedExitPermitNeverTakenThroughTheGate covers the
// real-clock expiry job: an approved exit permit from an earlier day used
// to stay approved for ever, since the job closed only in_progress ones
// and the student cannot cancel an approved permit.
func TestExpiryClosesAnApprovedExitPermitNeverTakenThroughTheGate(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-expire-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	past := time.Now().In(loc).AddDate(0, 0, -3)
	morning := clock.WithTime(ctx, time.Date(past.Year(), past.Month(), past.Day(), 7, 10, 0, 0, loc))
	instID, _ := runExitPermitToGate(t, morning, svc, w)

	_, err = svc.ExpireHangingInstances(ctx)
	require.NoError(t, err)

	out, err := svc.GetExitPermit(ctx, w.tenantID, instID)
	require.NoError(t, err)
	require.Equal(t, domain.StatusExpired, out.Instance.Status)
}
