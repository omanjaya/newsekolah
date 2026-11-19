package permits

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// issueDeskToken mints the picket desk's unbound approve_stage token.
func issueDeskToken(t *testing.T, ctx context.Context, svc *service.Service, w realtimeWorld, issuer uuid.UUID) domain.IssueResult {
	t.Helper()
	issued, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, IssuedByUserID: issuer,
	})
	require.NoError(t, err)
	require.False(t, issued.Token.ContextID.Valid, "a desk token is bound to no instance")
	return issued
}

func createExitPermit(t *testing.T, ctx context.Context, svc *service.Service, w realtimeWorld) domain.Instance {
	t.Helper()
	inst, _, err := svc.CreateExitPermit(ctx, service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err)
	return inst
}

// seedLeadership adds a user holding an active school-scoped "leadership"
// duty, so approver_rule "duty:leadership" accepts them.
func seedLeadership(t *testing.T, ctx context.Context, pool *pgxpool.Pool, w realtimeWorld) uuid.UUID {
	t.Helper()
	q := db.New(pool)
	user, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "kepsek-" + uuid.NewString(), PasswordHash: "x", Name: "Kepala Sekolah Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	dutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{TenantID: w.tenantID, Slug: "leadership", Name: "Pimpinan", ScopeKind: "school"})
	require.NoError(t, err)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, DutyTypeID: dutyType.ID, UserID: user.ID,
		StartsOn: database.Date(time.Now().AddDate(0, 0, -30)),
	})
	require.NoError(t, err)
	return user.ID
}

// TestDeskTokenApprovesExitPermitDutyStage is the picket desk's exit
// mode: one rotating QR bound to no permit, which the student's scan binds
// to their own permit. It approves the any_teacher duty_teacher stage with
// the issuing teacher as the recorded approver, lives 30 seconds, and is
// single use.
func TestDeskTokenApprovesExitPermitDutyStage(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "desk-exit-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)
	inst := createExitPermit(t, ctx, svc, w)

	before := time.Now()
	desk := issueDeskToken(t, ctx, svc, w, w.dutyTeacherID)
	require.WithinDuration(t, before.Add(30*time.Second), desk.ExpiresAt, 2*time.Second, "a desk token is short lived")

	updated, err := svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, desk.RawValue)
	require.NoError(t, err)
	require.Equal(t, domain.StatusInProgress, updated.Status)
	require.Equal(t, 1, updated.CurrentStageIndex, "the duty_teacher stage passed; the counselor's is next")

	detail, err := svc.GetExitPermit(ctx, w.tenantID, inst.ID)
	require.NoError(t, err)
	var approval domain.Event
	for _, e := range detail.Events {
		if e.StageKey == "duty_teacher" && e.ScanTokenID.Valid {
			approval = e
		}
	}
	require.Equal(t, w.dutyTeacherID, approval.ActorUserID.UUID, "the approver is the teacher whose desk showed the QR, not the scanning student")
	require.Equal(t, desk.Token.ID, approval.ScanTokenID.UUID)

	var consumedBy uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select consumed_by_user_id from scan_tokens where id = $1`, desk.Token.ID).Scan(&consumedBy))
	require.Equal(t, w.studentID, consumedBy)

	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, desk.RawValue)
	require.ErrorIs(t, err, domain.ErrTokenNotFound, "a desk token is single use")
}

// TestDeskTokenOnlyAdvancesAnyTeacherExitStage is the token's scope: once a
// permit waits at a duty-scoped stage (the counselor), a desk token is
// refused and the permit stays where it was. The rollback leaves the token
// unconsumed, so it cannot have been spent on the refusal either.
func TestDeskTokenOnlyAdvancesAnyTeacherExitStage(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "desk-scope-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)
	inst := createExitPermit(t, ctx, svc, w)

	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, issueDeskToken(t, ctx, svc, w, w.dutyTeacherID).RawValue)
	require.NoError(t, err)

	desk := issueDeskToken(t, ctx, svc, w, w.dutyTeacherID)
	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, desk.RawValue)
	require.ErrorIs(t, err, domain.ErrStageVerificationMismatch)

	detail, err := svc.GetExitPermit(ctx, w.tenantID, inst.ID)
	require.NoError(t, err)
	require.Equal(t, 1, detail.Instance.CurrentStageIndex, "a refused desk token must not move the permit")

	var consumed bool
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select consumed_at is not null from scan_tokens where id = $1`, desk.Token.ID).Scan(&consumed))
	require.False(t, consumed)
}

// TestDeskTokenChecksDistinctFrom: binding at scan time still runs the
// stage's DistinctFrom against the issuer, so one teacher's desk cannot
// approve two stages a chain requires different people for.
func TestDeskTokenChecksDistinctFrom(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "desk-distinct-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	stages := []domain.Stage{
		{Key: "duty_teacher", Label: "Guru piket", ApproverRule: domain.RuleAnyTeacher, Verification: domain.VerificationQRScan},
		{Key: "second_teacher", Label: "Guru kedua", ApproverRule: domain.RuleAnyTeacher, Verification: domain.VerificationQRScan, DistinctFrom: []string{"duty_teacher"}},
	}
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, stages, map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)
	inst := createExitPermit(t, ctx, svc, w)

	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, issueDeskToken(t, ctx, svc, w, w.dutyTeacherID).RawValue)
	require.NoError(t, err)

	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, issueDeskToken(t, ctx, svc, w, w.dutyTeacherID).RawValue)
	require.ErrorIs(t, err, domain.ErrApproverNotDistinct)
}

// TestDeskTokenRefusedToNonTeacher: only an active teacher may mint the
// desk token, since only any_teacher stages accept it.
func TestDeskTokenRefusedToNonTeacher(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "desk-nonteacher-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})

	_, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, IssuedByUserID: w.counselorID,
	})
	require.ErrorIs(t, err, domain.ErrApproverNotEligible)
}

// TestDeskTokenCannotAdvanceLateArrival: a late arrival's QR stages each
// need a token bound to the flow, so a desk token is refused there.
func TestDeskTokenCannotAdvanceLateArrival(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "desk-late-"+uuid.NewString())
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	opened := openLateArrival(t, ctx, svc, w)
	_, err := svc.ReviewLateArrival(ctx, service.ReviewLateArrivalInput{
		TenantID: w.tenantID, InstanceID: opened.Instance.ID, ReviewerUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)

	_, err = svc.LateArrivalScan(ctx, w.tenantID, opened.Instance.ID, w.studentID, issueDeskToken(t, ctx, svc, w, w.dutyTeacherID).RawValue)
	require.ErrorIs(t, err, domain.ErrTokenContextMismatch)
}

// TestLateArrivalStagesKeepTheirVerification: the review form satisfies
// only the manual stage and a scan only a qr_scan stage, so neither path
// can skip the other.
func TestLateArrivalStagesKeepTheirVerification(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "late-verify-"+uuid.NewString())
	leadershipID := seedLeadership(t, ctx, pg.AdminPool, w)
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	opened := openLateArrival(t, ctx, svc, w)
	id := opened.Instance.ID

	bound, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, ContextID: uuid.NullUUID{UUID: id, Valid: true}, IssuedByUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)
	_, err = svc.LateArrivalScan(ctx, w.tenantID, id, w.studentID, bound.RawValue)
	require.ErrorIs(t, err, domain.ErrStageVerificationMismatch, "a scan must not skip the picket review")

	_, err = svc.ReviewLateArrival(ctx, service.ReviewLateArrivalInput{TenantID: w.tenantID, InstanceID: id, ReviewerUserID: w.dutyTeacherID})
	require.NoError(t, err)

	_, err = svc.ReviewLateArrival(ctx, service.ReviewLateArrivalInput{TenantID: w.tenantID, InstanceID: id, ReviewerUserID: w.dutyTeacherID})
	require.ErrorIs(t, err, domain.ErrStageVerificationMismatch, "the review form must not stand in for leadership's QR")

	leadershipToken, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, ContextID: uuid.NullUUID{UUID: id, Valid: true}, IssuedByUserID: leadershipID,
	})
	require.NoError(t, err)
	detail, err := svc.LateArrivalScan(ctx, w.tenantID, id, w.studentID, leadershipToken.RawValue)
	require.NoError(t, err)
	require.Equal(t, 2, detail.Instance.CurrentStageIndex, "leadership approved; the class teacher's stage is next")
}

// TestLateArrivalQueueFollowsTheCurrentStage: the queue lists a flow for
// the picket teacher while it waits for their review, then for leadership
// (and not the picket teacher) once it waits for leadership's QR, each
// item saying which stage it is at, and the badge counts the same list.
func TestLateArrivalQueueFollowsTheCurrentStage(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "late-queue-"+uuid.NewString())
	leadershipID := seedLeadership(t, ctx, pg.AdminPool, w)
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})

	queue := func(caller uuid.UUID) []service.LateArrivalReviewItem {
		t.Helper()
		items, err := svc.ListLateArrivalsForReview(ctx, w.tenantID, caller)
		require.NoError(t, err)
		count, err := svc.CountLateArrivalsForReview(ctx, w.tenantID, caller)
		require.NoError(t, err)
		require.Equal(t, len(items), count, "the inbox badge must match the queue")
		return items
	}

	opened := openLateArrival(t, ctx, svc, w)
	require.Equal(t, "X-A", opened.ClassName, "the opened flow names its class")
	picket := queue(w.dutyTeacherID)
	require.Len(t, picket, 1)
	require.Equal(t, "X-A", picket[0].ClassName, "a queue row names the student's class")
	require.Equal(t, "duty_teacher", picket[0].CurrentStage.Key)
	require.Equal(t, domain.VerificationManual, picket[0].CurrentStage.Verification)
	require.Empty(t, queue(leadershipID), "leadership has nothing to do before the review")

	_, err := svc.ReviewLateArrival(ctx, service.ReviewLateArrivalInput{
		TenantID: w.tenantID, InstanceID: opened.Instance.ID, ReviewerUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)

	require.Empty(t, queue(w.dutyTeacherID), "a reviewed flow leaves the picket teacher's queue")
	require.Empty(t, queue(w.counselorID))
	lead := queue(leadershipID)
	require.Len(t, lead, 1)
	require.Equal(t, opened.Instance.ID, lead[0].InstanceID)
	require.Equal(t, "leadership", lead[0].CurrentStage.Key)
	require.Equal(t, domain.VerificationQRScan, lead[0].CurrentStage.Verification)
	require.Equal(t, "X-A", lead[0].ClassName, "a scan-stage row names the class too")
	detail, err := svc.GetLateArrival(ctx, w.tenantID, opened.Instance.ID)
	require.NoError(t, err)
	require.Equal(t, "X-A", detail.ClassName, "the approver's detail names the class")

	// Leadership reads the flow it is asked to approve.
	require.NoError(t, svc.RequireCanViewLateArrival(ctx, w.tenantID, opened.Instance.ID, leadershipID))

	token, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, ContextID: uuid.NullUUID{UUID: opened.Instance.ID, Valid: true}, IssuedByUserID: leadershipID,
	})
	require.NoError(t, err)
	_, err = svc.LateArrivalScan(ctx, w.tenantID, opened.Instance.ID, w.studentID, token.RawValue)
	require.NoError(t, err)

	// The class teacher's stage (teacher_of_class_now) needs a schedule;
	// the test world has none (noSchedule), so nobody is listed for it.
	require.Empty(t, queue(leadershipID))
	require.Empty(t, queue(w.dutyTeacherID))
}

// TestDeskTokenTellsItsIssuer: the desk QR is bound to nobody, so the
// teacher who showed it learns which student it approved only from the
// "exit_permit.desk_approved" push to their own topic (the permit, the
// stage it approved and the student, by id). A bound stage QR, whose
// approver already chose the student, sends no such push.
func TestDeskTokenTellsItsIssuer(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "desk-issuer-"+uuid.NewString())
	hub := &fakeRealtimeHub{}
	svc := buildRealtimeTestService(pg.AppPool, hub)
	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)
	inst := createExitPermit(t, ctx, svc, w)

	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, issueDeskToken(t, ctx, svc, w, w.dutyTeacherID).RawValue)
	require.NoError(t, err)

	desk := deskApprovals(hub)
	require.Len(t, desk, 1)
	require.Equal(t, w.tenantID, desk[0].tenantID)
	require.Equal(t, w.dutyTeacherID, desk[0].userID, "the push goes to the teacher whose desk showed the QR")
	raw, err := json.Marshal(desk[0].payload)
	require.NoError(t, err)
	var got struct {
		InstanceID    uuid.UUID `json:"instance_id"`
		Stage         string    `json:"stage"`
		StudentUserID uuid.UUID `json:"student_user_id"`
	}
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, inst.ID, got.InstanceID)
	require.Equal(t, "duty_teacher", got.Stage, "the stage the desk approved, not the next one")
	require.Equal(t, w.studentID, got.StudentUserID)

	bound, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, ContextID: uuid.NullUUID{UUID: inst.ID, Valid: true}, IssuedByUserID: w.counselorID,
	})
	require.NoError(t, err)
	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, bound.RawValue)
	require.NoError(t, err)
	require.Len(t, deskApprovals(hub), 1, "a bound stage QR sends no desk push")
}

func deskApprovals(hub *fakeRealtimeHub) []recordedUserPublish {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	var out []recordedUserPublish
	for _, p := range hub.userPublishes {
		if p.eventType == "exit_permit.desk_approved" {
			out = append(out, p)
		}
	}
	return out
}

// TestLateArrivalQueueIsEmptyForAStudent: a student can pass no approver
// rule, so the queue the inbox badge polls for them stays empty even while
// flows wait at a qr_scan stage any teacher could approve.
func TestLateArrivalQueueIsEmptyForAStudent(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "late-student-"+uuid.NewString())
	_, err := pg.AdminPool.Exec(ctx, `insert into student_profiles (tenant_id, user_id) values ($1, $2)`, w.tenantID, w.studentID)
	require.NoError(t, err)
	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	stages := []domain.Stage{
		{Key: "duty_teacher", Label: "Guru piket", ApproverRule: domain.RuleAnyTeacher, Verification: domain.VerificationManual},
		{Key: "any_teacher_qr", Label: "Guru", ApproverRule: domain.RuleAnyTeacher, Verification: domain.VerificationQRScan},
	}
	_, err = svc.ReplaceDefinition(ctx, w.tenantID, domain.KindLateArrival, stages, map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)
	opened := openLateArrival(t, ctx, svc, w)
	_, err = svc.ReviewLateArrival(ctx, service.ReviewLateArrivalInput{
		TenantID: w.tenantID, InstanceID: opened.Instance.ID, ReviewerUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)

	teacherQueue, err := svc.ListLateArrivalsForReview(ctx, w.tenantID, w.dutyTeacherID)
	require.NoError(t, err)
	require.Len(t, teacherQueue, 1, "an active teacher passes the any_teacher stage")

	count, err := svc.CountLateArrivalsForReview(ctx, w.tenantID, w.studentID)
	require.NoError(t, err)
	require.Zero(t, count)
}
