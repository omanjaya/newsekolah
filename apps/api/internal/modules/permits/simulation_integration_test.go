package permits

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestSimulatedLateArrivalLandsOnSimulatedDay proves OpenLateArrival reads
// its business time from the simulated clock (docs/testing-time-
// simulation.md), not the server's real clock: opening the flow inside a
// request context carrying a simulated Monday 07:20 instant must record
// that exact instant as the instance's opened_at, and the tenant-local
// calendar day it belongs to (workflow_instances.local_date) must be that
// simulated Monday, regardless of what day it really is when the test runs.
func TestSimulatedLateArrivalLandsOnSimulatedDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "sim-late-"+uuid.NewString())

	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	monday := time.Now().In(loc)
	for monday.Weekday() != time.Monday {
		monday = monday.AddDate(0, 0, 1)
	}
	simulated := time.Date(monday.Year(), monday.Month(), monday.Day(), 7, 20, 0, 0, loc)
	simCtx := clock.WithTime(ctx, simulated)

	// Issuing the token itself carries no business-time decision (a scan
	// token's own expiry is security, real time -- see scantoken.go), only
	// OpenLateArrival's own bookkeeping does.
	issued, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeLateArrival, IssuedByUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)

	detail, err := svc.OpenLateArrival(simCtx, service.OpenLateArrivalInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, RawToken: issued.RawValue,
	})
	require.NoError(t, err)

	require.True(t, detail.Instance.OpenedAt.Equal(simulated),
		"opened_at must be the simulated instant, not the real wall-clock time the test actually ran at")
	require.Equal(t, time.Monday, detail.Instance.OpenedAt.In(loc).Weekday(),
		"the recorded instant must land on the simulated Monday")

	var localDate time.Time
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select local_date from workflow_instances where id = $1`, detail.Instance.ID).Scan(&localDate))
	require.Equal(t, simulated.Format("2006-01-02"), localDate.Format("2006-01-02"),
		"local_date must record the simulated tenant-local day the late arrival belongs to")

	// Every stage event follows the same simulated clock: the stepper
	// printed the real date under a simulated arrival while the event
	// insert dropped OccurredAt and fell back to the column's now().
	reviewedAt := simulated.Add(5 * time.Minute)
	_, err = svc.ReviewLateArrival(clock.WithTime(ctx, reviewedAt), service.ReviewLateArrivalInput{
		TenantID: w.tenantID, InstanceID: detail.Instance.ID, ReviewerUserID: w.dutyTeacherID, Reason: "Bangun kesiangan",
	})
	require.NoError(t, err)
	rows, err := pg.AdminPool.Query(ctx, `select occurred_at from workflow_events where instance_id = $1 order by occurred_at`, detail.Instance.ID)
	require.NoError(t, err)
	defer rows.Close()
	var occurred []time.Time
	for rows.Next() {
		var at time.Time
		require.NoError(t, rows.Scan(&at))
		occurred = append(occurred, at)
	}
	require.NoError(t, rows.Err())
	require.Len(t, occurred, 2, "the open and the review each record one event")
	require.True(t, occurred[0].Equal(simulated), "the open event must carry the simulated instant, got %s", occurred[0])
	require.True(t, occurred[1].Equal(reviewedAt), "the review event must carry the simulated instant, got %s", occurred[1])
}

// runExitPermitToGate drives an exit permit from creation through both
// approval stages (exitPermitDefinitionStages: duty_teacher -> counselor)
// to an issued gate token, entirely under ctx's business time, so a caller
// can then GateScan it at a different simulated instant to test the
// return.
func runExitPermitToGate(t *testing.T, ctx context.Context, svc *service.Service, w realtimeWorld) (instanceID uuid.UUID, rawGateToken string) {
	t.Helper()

	inst, _, err := svc.CreateExitPermit(ctx, service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err)

	dutyToken, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, ContextID: uuid.NullUUID{UUID: inst.ID, Valid: true}, IssuedByUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)
	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, dutyToken.RawValue)
	require.NoError(t, err)

	counselorToken, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, ContextID: uuid.NullUUID{UUID: inst.ID, Valid: true}, IssuedByUserID: w.counselorID,
	})
	require.NoError(t, err)
	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, counselorToken.RawValue)
	require.NoError(t, err)

	gate, err := svc.IssueGateToken(ctx, w.tenantID, inst.ID, w.dutyTeacherID)
	require.NoError(t, err)

	return inst.ID, gate.RawValue
}

// TestSimulatedExitPermitReturnFollowsSimulatedClock proves the exit and
// the return of an exit permit follow the simulated clock: GateScan stores
// the simulated exit time and the time the student is due back (the end of
// the permit's last period, 09:00 local in seedRealtimeWorld), and
// RecordExitPermitReturn stamps the simulated return time, which decides
// whether the return was on time or late. Two permits on different
// tenant-local days (one exit permit per day) differ only in the simulated
// instant of the return.
func TestSimulatedExitPermitReturnFollowsSimulatedClock(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "sim-exit-"+uuid.NewString())

	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	// The tenant default exit-permit definition includes a
	// "teacher_of_class_now" stage that can never be satisfied here
	// (Schedule is the always-false noSchedule stand-in -- see
	// realtime_integration_test.go's exitPermitDefinitionStages doc
	// comment), so swap in the same 2-stage definition those tests use.
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	loc, err := time.LoadLocation("Asia/Jakarta")
	require.NoError(t, err)
	base := time.Now().In(loc).AddDate(0, 0, 5)
	at := func(day, hour, minute int) time.Time {
		return time.Date(base.Year(), base.Month(), base.Day()+day, hour, minute, 0, 0, loc)
	}

	cases := []struct {
		name     string
		day      int
		returnAt time.Time
		late     bool
	}{
		{name: "back at 08:50, before the 09:00 period end, is on time", day: 0, returnAt: at(0, 8, 50), late: false},
		{name: "back at 09:45, after the 09:00 period end, is late", day: 1, returnAt: at(1, 9, 45), late: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			instID, gate := runExitPermitToGate(t, clock.WithTime(ctx, at(tc.day, 7, 10)), svc, w)

			exitedAt := at(tc.day, 7, 30)
			_, err := svc.GateScan(clock.WithTime(ctx, exitedAt), w.tenantID, instID, w.dutyTeacherID, gate)
			require.NoError(t, err)

			out, err := svc.GetExitPermit(ctx, w.tenantID, instID)
			require.NoError(t, err)
			require.NotNil(t, out.Permit.ExitedAt)
			require.True(t, out.Permit.ExitedAt.Equal(exitedAt), "exited_at must be the simulated scan instant")
			require.NotNil(t, out.Permit.ExpectedReturnAt)
			require.True(t, out.Permit.ExpectedReturnAt.Equal(at(tc.day, 9, 0)),
				"the student is due back at the end of the permit's last period on the exit day")
			require.True(t, out.Permit.AwaitingReturn())

			back, err := svc.RecordExitPermitReturn(clock.WithTime(ctx, tc.returnAt), w.tenantID, instID, w.dutyTeacherID)
			require.NoError(t, err)
			require.NotNil(t, back.Permit.ReturnedAt)
			require.True(t, back.Permit.ReturnedAt.Equal(tc.returnAt),
				"returned_at must be the simulated instant, not the real wall-clock time the test ran at")
			require.Equal(t, tc.late, back.Permit.ReturnedLate())

			last := back.Events[len(back.Events)-1]
			require.Equal(t, "gate_return", last.StageKey)
			require.True(t, last.OccurredAt.Equal(tc.returnAt))
			if tc.late {
				require.Equal(t, domain.NoteGateReturnLate, last.Note)
			} else {
				require.Equal(t, domain.NoteGateReturn, last.Note)
			}
		})
	}
}

// TestSimulatedLeaveRequestActiveTodayFollowsSimulatedDate proves the
// duty-based "today" every leave-request review/issuance check reads
// (service.tenantNow, via ListLeaveRequestsForReview and the approver-rule
// evaluation) follows the simulated clock: narrowing the counselor's duty
// assignment to end partway through the leave request's own lifecycle,
// the request is "active" in the counselor's review queue on a simulated
// today before that cutoff and drops out of it on a simulated today after
// the cutoff -- even though the real wall-clock date never changes across
// the two calls. It also exercises letter numbering (month/year) following
// the same simulated clock.
func TestSimulatedLeaveRequestActiveTodayFollowsSimulatedDate(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLeaveWorld(t, ctx, pg.AdminPool, "sim-leave-"+uuid.NewString())

	sync := &fakeAttendanceSync{}
	svc := buildLeaveService(pg.AppPool, sync)

	// A year distinctly different from whenever the test actually runs,
	// so the letter-numbering assertion below cannot pass by accident.
	real := time.Now()
	day1 := time.Date(real.Year()+1, real.Month(), real.Day(), 8, 0, 0, 0, time.UTC)
	cutoff := day1.AddDate(0, 0, 3)
	day2 := day1.AddDate(0, 0, 10)

	// Narrow the counselor's duty window (seedLeaveWorld leaves ends_on
	// unset, i.e. open-ended) so whether they still hold it depends on
	// which simulated "today" a call evaluates.
	_, err := pg.AdminPool.Exec(ctx, `update duty_assignments set ends_on = $1 where tenant_id = $2 and user_id = $3`,
		cutoff, w.tenantID, w.counselorID)
	require.NoError(t, err)

	ctxDay1 := clock.WithTime(ctx, day1)
	submitted, err := svc.SubmitLeaveRequest(ctxDay1, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategorySick, StartsOn: day1, EndsOn: day1.AddDate(0, 0, 2),
	})
	require.NoError(t, err)

	reviewed, err := svc.ReviewLeaveRequest(ctxDay1, w.tenantID, submitted.Instance.ID, w.homeroomTeacherID, true, "disetujui wali kelas")
	require.NoError(t, err)
	require.Equal(t, domain.StatusInProgress, reviewed.Instance.Status, "approving the non-final homeroom stage must not close the instance")

	activeList, err := svc.ListLeaveRequestsForReview(ctxDay1, w.tenantID, w.counselorID, uuid.NullUUID{})
	require.NoError(t, err)
	require.Len(t, activeList, 1, "the counselor's duty is still active on the simulated day, so the request must be in their queue")
	require.Equal(t, submitted.Instance.ID, activeList[0].InstanceID)

	inactiveList, err := svc.ListLeaveRequestsForReview(clock.WithTime(ctx, day2), w.tenantID, w.counselorID, uuid.NullUUID{})
	require.NoError(t, err)
	require.Empty(t, inactiveList, "the counselor's duty has ended by the later simulated day, so the request must drop out of their queue")

	// Issue the letter back on day1, while the counselor is still an
	// eligible approver, to also prove letter numbering follows the
	// simulated clock.
	issued, err := svc.IssueLeaveLetter(ctxDay1, w.tenantID, submitted.Instance.ID, w.counselorID)
	require.NoError(t, err)
	require.Contains(t, issued.LeaveRequest.LetterNumber, fmt.Sprintf("/%d", day1.Year()),
		"the letter number must carry the simulated issuance year, not the real one")
	require.NotNil(t, issued.LeaveRequest.IssuedAt)
	require.True(t, issued.LeaveRequest.IssuedAt.Equal(day1), "issued_at must be the simulated instant")
}
