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

// TestLeaveRequestCountMatchesReviewQueue proves the action-inbox badge for
// leave requests is exactly the length of the reviewer's queue for every
// reviewer and every simulated day: a homeroom teacher while the request is
// at their stage, the counselor once it moves on (and only while their duty
// is active), and nobody else.
func TestLeaveRequestCountMatchesReviewQueue(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLeaveWorld(t, ctx, pg.AdminPool, "inbox-leave-"+uuid.NewString())
	svc := buildLeaveService(pg.AppPool, &fakeAttendanceSync{})

	real := time.Now()
	day1 := time.Date(real.Year()+1, real.Month(), real.Day(), 8, 0, 0, 0, time.UTC)
	cutoff := day1.AddDate(0, 0, 3)
	day2 := day1.AddDate(0, 0, 10)
	_, err := pg.AdminPool.Exec(ctx, `update duty_assignments set ends_on = $1 where tenant_id = $2 and user_id = $3`,
		cutoff, w.tenantID, w.counselorID)
	require.NoError(t, err)

	requireCountMatchesQueue := func(ctx context.Context, reviewer uuid.UUID, want int, msg string) {
		t.Helper()
		queue, err := svc.ListLeaveRequestsForReview(ctx, w.tenantID, reviewer, uuid.NullUUID{})
		require.NoError(t, err)
		count, err := svc.CountLeaveRequestsForReview(ctx, w.tenantID, reviewer)
		require.NoError(t, err)
		require.Len(t, queue, want, msg)
		require.Equal(t, len(queue), count, msg)
	}

	ctxDay1 := clock.WithTime(ctx, day1)
	submitted, err := svc.SubmitLeaveRequest(ctxDay1, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategorySick, StartsOn: day1, EndsOn: day1.AddDate(0, 0, 2),
	})
	require.NoError(t, err)

	requireCountMatchesQueue(ctxDay1, w.homeroomTeacherID, 1, "homeroom stage: the homeroom teacher has it")
	requireCountMatchesQueue(ctxDay1, w.counselorID, 0, "homeroom stage: the counselor does not yet")
	requireCountMatchesQueue(ctxDay1, w.studentID, 0, "the requester has nothing to review")

	_, err = svc.ReviewLeaveRequest(ctxDay1, w.tenantID, submitted.Instance.ID, w.homeroomTeacherID, true, "disetujui wali kelas")
	require.NoError(t, err)

	requireCountMatchesQueue(ctxDay1, w.homeroomTeacherID, 0, "it moved past the homeroom stage")
	requireCountMatchesQueue(ctxDay1, w.counselorID, 1, "counselor stage while the duty is active")
	requireCountMatchesQueue(clock.WithTime(ctx, day2), w.counselorID, 0, "counselor duty ended by the later simulated day")
}

// TestLateAndExitCountsMatchQueues covers the two queues open to every
// authenticated caller: the badge must equal each caller's own scoped queue,
// so a late arrival counts only for the teacher who opened it and an exit
// permit only for the duty holder at its current stage.
func TestLateAndExitCountsMatchQueues(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "inbox-late-exit-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})

	requireLateMatches := func(caller uuid.UUID, want int) {
		t.Helper()
		queue, err := svc.ListLateArrivalsForReview(ctx, w.tenantID, caller)
		require.NoError(t, err)
		count, err := svc.CountLateArrivalsForReview(ctx, w.tenantID, caller)
		require.NoError(t, err)
		require.Len(t, queue, want)
		require.Equal(t, len(queue), count)
	}
	requireExitMatches := func(caller uuid.UUID, want int) {
		t.Helper()
		queue, err := svc.ListExitPermitsForApproval(ctx, w.tenantID, caller)
		require.NoError(t, err)
		count, err := svc.CountExitPermitsForApproval(ctx, w.tenantID, caller)
		require.NoError(t, err)
		require.Len(t, queue, want)
		require.Equal(t, len(queue), count)
	}

	requireLateMatches(w.dutyTeacherID, 0)
	requireExitMatches(w.counselorID, 0)

	token, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeLateArrival, IssuedByUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)
	_, err = svc.OpenLateArrival(ctx, service.OpenLateArrivalInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, RawToken: token.RawValue,
	})
	require.NoError(t, err)

	requireLateMatches(w.dutyTeacherID, 1)
	requireLateMatches(w.counselorID, 0)
	requireLateMatches(w.studentID, 0)

	_, err = svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	// An exit permit at the duty teacher's scan stage is in nobody's queue
	// (QR-scan only); once approved there it waits for the counselor.
	inst, _, err := svc.CreateExitPermit(ctx, service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err)
	requireExitMatches(w.counselorID, 0)

	dutyToken, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, ContextID: uuid.NullUUID{UUID: inst.ID, Valid: true}, IssuedByUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)
	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, dutyToken.RawValue)
	require.NoError(t, err)

	requireExitMatches(w.counselorID, 1)
	requireExitMatches(w.studentID, 0)
}
