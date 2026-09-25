package permits

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// recordedDutyPublish and recordedUserPublish capture one
// RealtimePublisher call each, for tests to assert topic-shaping (duty
// slug/classID, or user id), event type, and payload without a real
// platform/realtime.Hub or WebSocket connection -- the plan's "fake hub
// asserting topic, type, and payload" (docs/analysis/
// realtime-plan-2026-09-25.md section 4, chunk C1's test row).
type recordedDutyPublish struct {
	tenantID  uuid.UUID
	dutySlug  string
	classID   uuid.NullUUID
	eventType string
	payload   any
}

type recordedUserPublish struct {
	tenantID  uuid.UUID
	userID    uuid.UUID
	eventType string
	payload   any
}

// fakeRealtimeHub implements permits/service.RealtimePublisher, recording
// every call instead of touching a real Hub. Safe for concurrent use even
// though these tests call it sequentially, since Service does not
// guarantee its own call ordering across goroutines in general.
type fakeRealtimeHub struct {
	mu            sync.Mutex
	dutyPublishes []recordedDutyPublish
	userPublishes []recordedUserPublish
}

func (f *fakeRealtimeHub) PublishToUser(_ context.Context, tenantID, userID uuid.UUID, eventType string, payload any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.userPublishes = append(f.userPublishes, recordedUserPublish{tenantID: tenantID, userID: userID, eventType: eventType, payload: payload})
	return nil
}

func (f *fakeRealtimeHub) PublishToDuty(_ context.Context, tenantID uuid.UUID, dutySlug string, classID uuid.NullUUID, eventType string, payload any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.dutyPublishes = append(f.dutyPublishes, recordedDutyPublish{tenantID: tenantID, dutySlug: dutySlug, classID: classID, eventType: eventType, payload: payload})
	return nil
}

func (f *fakeRealtimeHub) totalPublishes() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.dutyPublishes) + len(f.userPublishes)
}

// requireInstancePayload/requireStagePayload/requireClassroomEntryPayload
// assert a recorded payload's shape by round-tripping it through JSON
// rather than a type assertion: the payload types (instanceEventPayload,
// instanceStageEventPayload, classroomEntryScannedPayload) are unexported
// in permits/service, so this package (permits, the integration test
// package) can only see them through the same json tags the wire format
// itself uses -- which is exactly what these tests care about anyway.
func requireInstancePayload(t *testing.T, payload any, wantInstanceID uuid.UUID) {
	t.Helper()
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	var got struct {
		InstanceID uuid.UUID `json:"instance_id"`
	}
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, wantInstanceID, got.InstanceID)
}

func requireStagePayload(t *testing.T, payload any, wantInstanceID uuid.UUID, wantStage string) {
	t.Helper()
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	var got struct {
		InstanceID uuid.UUID `json:"instance_id"`
		Stage      string    `json:"stage"`
	}
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, wantInstanceID, got.InstanceID)
	require.Equal(t, wantStage, got.Stage)
}

func requireClassroomEntryPayload(t *testing.T, payload any, wantStudentID uuid.UUID, wantClassID uuid.NullUUID) {
	t.Helper()
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	var got struct {
		StudentUserID uuid.UUID     `json:"student_user_id"`
		ClassID       uuid.NullUUID `json:"class_id,omitempty"`
	}
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, wantStudentID, got.StudentUserID)
	require.Equal(t, wantClassID, got.ClassID)
}

// buildRealtimeTestService wires a *service.Service the same way
// module.go's Register does, but with hub (a *fakeRealtimeHub) standing in
// for the real platform/realtime.Hub-backed publisher, and Schedule/Sync/
// Discipline left at the same no-op stand-ins Register itself falls back
// to when those modules are not wired -- these tests never exercise the
// "teacher_of_class_now" approver rule or attendance sync, so the
// always-false/no-op behaviour those stand-ins document is fine here.
func buildRealtimeTestService(pool *pgxpool.Pool, hub service.RealtimePublisher) *service.Service {
	schoolModule := school.Register(pool, tenant.ModeSingle, nil)
	return service.New(
		pool, repository.New(pool), schoolModule.Service,
		noSchedule{}, noSync{}, noDiscipline{},
		nil, hub, nil,
		documents.NewHTMLPDFRenderer(), clock.Real{},
		service.DefaultConfig([]byte("a-test-signing-key"), "test-bucket"),
	)
}

// realtimeWorld is one tenant with an active academic year, one class, one
// enrolled student, a duty_teacher (with a teacher_profiles row, so
// approver_rule "any_teacher" accepts them) and a counselor holding a
// school-scoped "counselor" duty (so approver_rule "duty:counselor"
// accepts them) -- enough to drive late arrivals, a 2-stage exit-permit
// definition, and leave requests through their full realtime-publishing
// paths.
type realtimeWorld struct {
	tenantID, yearID, classID  uuid.UUID
	studentID                  uuid.UUID
	dutyTeacherID              uuid.UUID
	counselorID                uuid.UUID
	startPeriodID, endPeriodID uuid.UUID
}

func seedRealtimeWorld(t *testing.T, ctx context.Context, pool *pgxpool.Pool, slug string) realtimeWorld {
	t.Helper()
	q := db.New(pool)
	var w realtimeWorld

	tn, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: slug, Name: slug, EducationLevel: "sma", Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	w.tenantID = tn.ID

	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: w.tenantID, Label: "2025/2026",
		StartsOn: database.Date(time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)
	w.yearID = year.ID

	var gradeLevelID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`insert into grade_levels (tenant_id, code, name, sequence) values ($1, 'X', 'Kelas X', 1) returning id`,
		w.tenantID,
	).Scan(&gradeLevelID))

	class, err := q.CreateClass(ctx, db.CreateClassParams{TenantID: w.tenantID, AcademicYearID: w.yearID, GradeLevelID: gradeLevelID, Name: "X-A"})
	require.NoError(t, err)
	w.classID = class.ID

	student, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "student-" + slug, PasswordHash: "x", Name: "Siswa Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.studentID = student.ID

	_, err = pool.Exec(ctx,
		`insert into enrollments (tenant_id, academic_year_id, student_user_id, class_id, status, joined_on) values ($1, $2, $3, $4, 'active', current_date)`,
		w.tenantID, w.yearID, w.studentID, w.classID,
	)
	require.NoError(t, err)

	dutyTeacher, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "piket-" + slug, PasswordHash: "x", Name: "Guru Piket Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.dutyTeacherID = dutyTeacher.ID
	_, err = pool.Exec(ctx, `insert into teacher_profiles (user_id, tenant_id) values ($1, $2)`, w.dutyTeacherID, w.tenantID)
	require.NoError(t, err)

	// homeroom_teacher_id has no sqlc write query (see other integration
	// tests' seed helpers for the same gap): set it directly so
	// GetActiveEnrollment.HomeroomTeacherID.Valid is true.
	_, err = pool.Exec(ctx, `update classes set homeroom_teacher_id = $1 where tenant_id = $2 and id = $3`,
		w.dutyTeacherID, w.tenantID, w.classID)
	require.NoError(t, err)

	homeroomDutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{TenantID: w.tenantID, Slug: "homeroom", Name: "Wali Kelas", ScopeKind: "class"})
	require.NoError(t, err)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, DutyTypeID: homeroomDutyType.ID, UserID: w.dutyTeacherID,
		ScopeClassID: database.NullUUID(uuid.NullUUID{UUID: w.classID, Valid: true}),
		StartsOn:     database.Date(time.Now().AddDate(0, 0, -30)),
	})
	require.NoError(t, err)

	counselor, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "counselor-" + slug, PasswordHash: "x", Name: "Guru BK Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.counselorID = counselor.ID

	counselorDutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{TenantID: w.tenantID, Slug: "counselor", Name: "Guru BK", ScopeKind: "school"})
	require.NoError(t, err)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, DutyTypeID: counselorDutyType.ID, UserID: w.counselorID,
		StartsOn: database.Date(time.Now().AddDate(0, 0, -30)),
	})
	require.NoError(t, err)

	// Disable "evidence_required" so leave-request review/issuance does not
	// also need the evidence-upload pipeline, unrelated to what these
	// tests cover.
	_, err = pool.Exec(ctx,
		`insert into tenant_policies (tenant_id, kind, version, config, effective_from) values ($1, 'permits', 1, $2, current_date)`,
		w.tenantID, []byte(`{"evidence_required": false}`),
	)
	require.NoError(t, err)

	template, err := q.AcademicCreatePeriodTemplate(ctx, db.AcademicCreatePeriodTemplateParams{TenantID: w.tenantID, Name: "Default", IsDefault: true})
	require.NoError(t, err)

	startPeriod, err := q.AcademicCreatePeriod(ctx, db.AcademicCreatePeriodParams{
		TenantID: w.tenantID, TemplateID: template.ID, Name: "Jam 1", Sequence: 1,
		StartsAt: pgtype.Time{Microseconds: int64(7 * time.Hour / time.Microsecond), Valid: true},
		EndsAt:   pgtype.Time{Microseconds: int64(8 * time.Hour / time.Microsecond), Valid: true},
	})
	require.NoError(t, err)
	w.startPeriodID = startPeriod.ID

	endPeriod, err := q.AcademicCreatePeriod(ctx, db.AcademicCreatePeriodParams{
		TenantID: w.tenantID, TemplateID: template.ID, Name: "Jam 2", Sequence: 2,
		StartsAt: pgtype.Time{Microseconds: int64(8 * time.Hour / time.Microsecond), Valid: true},
		EndsAt:   pgtype.Time{Microseconds: int64(9 * time.Hour / time.Microsecond), Valid: true},
	})
	require.NoError(t, err)
	w.endPeriodID = endPeriod.ID

	return w
}

// TestOpenLateArrivalPublishesToDutyTeacherTopic covers opportunity #1
// (docs/analysis/realtime-plan-2026-09-25.md section 2): the picket
// teacher's review queue must get a live "late_arrival.opened" push,
// carrying only the instance id, the moment a student checks in late.
func TestOpenLateArrivalPublishesToDutyTeacherTopic(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "late-open-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildRealtimeTestService(pg.AppPool, hub)

	issued, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeLateArrival, IssuedByUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)
	require.Empty(t, hub.dutyPublishes, "minting a token must not publish anything by itself")

	detail, err := svc.OpenLateArrival(ctx, service.OpenLateArrivalInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, RawToken: issued.RawValue,
	})
	require.NoError(t, err)

	require.Len(t, hub.dutyPublishes, 1)
	got := hub.dutyPublishes[0]
	require.Equal(t, w.tenantID, got.tenantID)
	require.Equal(t, "duty_teacher", got.dutySlug)
	require.False(t, got.classID.Valid, "duty_teacher is tenant-wide, not class-scoped")
	require.Equal(t, "late_arrival.opened", got.eventType)
	requireInstancePayload(t, got.payload, detail.Instance.ID)
}

// TestOpenLateArrivalPublishesNothingWhenTokenInvalid is the negative half
// of the same opportunity: a failed open (a token that does not exist)
// must roll back and never reach the hub -- publishing only ever happens
// after the transaction that created the row actually commits.
func TestOpenLateArrivalPublishesNothingWhenTokenInvalid(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "late-fail-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildRealtimeTestService(pg.AppPool, hub)

	_, err := svc.OpenLateArrival(ctx, service.OpenLateArrivalInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, RawToken: "does-not-exist",
	})
	require.ErrorIs(t, err, domain.ErrTokenNotFound)
	require.Equal(t, 0, hub.totalPublishes(), "a rolled-back OpenLateArrival must not publish anything")
}

// TestReviewLateArrivalPublishesToDutyTeacherTopic covers the review half
// of opportunity #1: the picket teacher's own queue must refresh once they
// review the flow, not just when it opens.
func TestReviewLateArrivalPublishesToDutyTeacherTopic(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "late-review-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildRealtimeTestService(pg.AppPool, hub)

	issued, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeLateArrival, IssuedByUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)
	opened, err := svc.OpenLateArrival(ctx, service.OpenLateArrivalInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, RawToken: issued.RawValue,
	})
	require.NoError(t, err)
	require.Len(t, hub.dutyPublishes, 1, "the open above already published once")

	_, err = svc.ReviewLateArrival(ctx, service.ReviewLateArrivalInput{
		TenantID: w.tenantID, InstanceID: opened.Instance.ID, ReviewerUserID: w.dutyTeacherID, Reason: "Macet",
	})
	require.NoError(t, err)

	require.Len(t, hub.dutyPublishes, 2)
	got := hub.dutyPublishes[1]
	require.Equal(t, "duty_teacher", got.dutySlug)
	require.Equal(t, "late_arrival.updated", got.eventType)
	requireInstancePayload(t, got.payload, opened.Instance.ID)
}

// exitPermitDefinitionStages is a 2-stage exit-permit definition
// (duty_teacher -> counselor) used instead of the tenant default (which
// includes "class_teacher", approver_rule teacher_of_class_now --
// unsatisfiable here since Schedule is the always-false noSchedule stand-
// in, per service.ScheduleLookup's documented gap). This still exercises
// both a non-last stage transition (duty_teacher -> counselor) and the
// last-stage "issued" transition these tests assert on.
func exitPermitDefinitionStages() []domain.Stage {
	return []domain.Stage{
		{Key: "duty_teacher", Label: "Guru piket", ApproverRule: domain.RuleAnyTeacher, Verification: domain.VerificationQRScan},
		{Key: "counselor", Label: "Guru BK", ApproverRule: "duty:counselor", Verification: domain.VerificationQRScan, DistinctFrom: []string{"duty_teacher"}},
	}
}

// TestExitPermitLifecyclePublishesStageAndUserTopics covers opportunity #2:
// creating the permit pushes the duty teacher's queue; the duty teacher's
// scan advances the flow and pushes both the requester (waiting in front
// of the desk) and the next reviewer's (counselor) queue; the counselor's
// scan finishes the chain and pushes the requester plus security duty
// (who now has a gate scan to do).
func TestExitPermitLifecyclePublishesStageAndUserTopics(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-lifecycle-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildRealtimeTestService(pg.AppPool, hub)

	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	inst, _, err := svc.CreateExitPermit(ctx, service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err)
	require.Len(t, hub.dutyPublishes, 1, "creating the permit must push the duty teacher's queue")
	require.Equal(t, "duty_teacher", hub.dutyPublishes[0].dutySlug)
	require.Equal(t, "exit_permit.stage_changed", hub.dutyPublishes[0].eventType)
	requireStagePayload(t, hub.dutyPublishes[0].payload, inst.ID, "duty_teacher")

	dutyTeacherToken, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, ContextID: uuid.NullUUID{UUID: inst.ID, Valid: true}, IssuedByUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)
	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, dutyTeacherToken.RawValue)
	require.NoError(t, err)

	require.Len(t, hub.dutyPublishes, 2, "advancing to counselor must push the counselor's queue")
	require.Equal(t, "counselor", hub.dutyPublishes[1].dutySlug)
	require.Equal(t, "exit_permit.stage_changed", hub.dutyPublishes[1].eventType)
	requireStagePayload(t, hub.dutyPublishes[1].payload, inst.ID, "counselor")
	require.Len(t, hub.userPublishes, 1, "the requester must also be told their permit moved on")
	require.Equal(t, w.studentID, hub.userPublishes[0].userID)
	require.Equal(t, "exit_permit.stage_changed", hub.userPublishes[0].eventType)

	counselorToken, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage, ContextID: uuid.NullUUID{UUID: inst.ID, Valid: true}, IssuedByUserID: w.counselorID,
	})
	require.NoError(t, err)
	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, counselorToken.RawValue)
	require.NoError(t, err)

	require.Len(t, hub.dutyPublishes, 3, "the final stage must push security duty (gate scan is next)")
	require.Equal(t, "security", hub.dutyPublishes[2].dutySlug)
	require.Equal(t, "exit_permit.issued", hub.dutyPublishes[2].eventType)
	require.Len(t, hub.userPublishes, 2, "the requester must also be told the permit is fully approved")
	require.Equal(t, "exit_permit.issued", hub.userPublishes[1].eventType)
}

// TestExitPermitScanPublishesNothingOnBadToken is the negative case for
// opportunity #2: consuming a wrong/expired token rolls the transaction
// back before any stage advances, so nothing must reach the hub beyond
// what CreateExitPermit already published.
func TestExitPermitScanPublishesNothingOnBadToken(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "exit-fail-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildRealtimeTestService(pg.AppPool, hub)

	_, err := svc.ReplaceDefinition(ctx, w.tenantID, domain.KindExitPermit, exitPermitDefinitionStages(), map[string]any{}, w.dutyTeacherID)
	require.NoError(t, err)

	inst, _, err := svc.CreateExitPermit(ctx, service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err)
	require.Len(t, hub.dutyPublishes, 1)
	before := hub.totalPublishes()

	_, err = svc.ExitPermitScan(ctx, w.tenantID, inst.ID, w.studentID, "not-a-real-token")
	require.ErrorIs(t, err, domain.ErrTokenNotFound)
	require.Equal(t, before, hub.totalPublishes(), "a rolled-back scan must not publish anything more")
}

// TestSubmitLeaveRequestPublishesToHomeroomDutyTopic covers opportunity
// #3: the homeroom teacher's review queue must get a live push, scoped to
// the student's own class.
func TestSubmitLeaveRequestPublishesToHomeroomDutyTopic(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "leave-submit-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildRealtimeTestService(pg.AppPool, hub)

	starts := time.Now().UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
	ends := starts.Add(24 * time.Hour)
	detail, err := svc.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategorySick, StartsOn: starts, EndsOn: ends,
	})
	require.NoError(t, err)

	require.Len(t, hub.dutyPublishes, 1)
	got := hub.dutyPublishes[0]
	require.Equal(t, "homeroom", got.dutySlug)
	require.True(t, got.classID.Valid, "homeroom is class-scoped")
	require.Equal(t, w.classID, got.classID.UUID)
	require.Equal(t, "leave_request.submitted", got.eventType)
	requireInstancePayload(t, got.payload, detail.Instance.ID)
}

// TestSubmitLeaveRequestPublishesNothingWithoutHomeroomTeacher is the
// negative case: SubmitLeaveRequest refuses a class with no homeroom
// teacher (ErrHomeroomTeacherRequired) before ever creating the instance,
// so nothing must publish.
func TestSubmitLeaveRequestPublishesNothingWithoutHomeroomTeacher(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "leave-fail-"+uuid.NewString())
	_, err := pg.AdminPool.Exec(ctx, `update classes set homeroom_teacher_id = null where tenant_id = $1 and id = $2`, w.tenantID, w.classID)
	require.NoError(t, err)

	hub := &fakeRealtimeHub{}
	svc := buildRealtimeTestService(pg.AppPool, hub)

	starts := time.Now().UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
	_, err = svc.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategorySick, StartsOn: starts, EndsOn: starts.Add(24 * time.Hour),
	})
	require.ErrorIs(t, err, domain.ErrHomeroomTeacherRequired)
	require.Equal(t, 0, hub.totalPublishes())
}

// TestReviewLeaveRequestPublishesToCounselorAndRequester covers the
// review half of opportunity #3: approving the homeroom stage must push
// both the counselor's queue (next reviewer) and the requester's own
// topic (they are waiting on the outcome).
func TestReviewLeaveRequestPublishesToCounselorAndRequester(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "leave-review-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildRealtimeTestService(pg.AppPool, hub)

	starts := time.Now().UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
	submitted, err := svc.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategorySick, StartsOn: starts, EndsOn: starts.Add(24 * time.Hour),
	})
	require.NoError(t, err)
	require.Len(t, hub.dutyPublishes, 1)

	_, err = svc.ReviewLeaveRequest(ctx, w.tenantID, submitted.Instance.ID, w.dutyTeacherID, true, "disetujui")
	require.NoError(t, err)

	require.Len(t, hub.dutyPublishes, 2)
	got := hub.dutyPublishes[1]
	require.Equal(t, "counselor", got.dutySlug)
	require.False(t, got.classID.Valid, "counselor is tenant-wide")
	require.Equal(t, "leave_request.reviewed", got.eventType)

	require.Len(t, hub.userPublishes, 1)
	require.Equal(t, w.studentID, hub.userPublishes[0].userID)
	require.Equal(t, "leave_request.reviewed", hub.userPublishes[0].eventType)
}

// TestScanClassroomEntryPublishesMinimalEnvelopePayload covers the
// classroom_entry_scanned normalization: the event must carry the shared
// Envelope's type/payload shape via PublishToUser, and the payload must
// carry only ids (student_user_id, class_id) -- never the student's name,
// NIS, class name, or the scan's free-text reason.
func TestScanClassroomEntryPublishesMinimalEnvelopePayload(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "classroom-entry-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildRealtimeTestService(pg.AppPool, hub)

	_, err := pg.AdminPool.Exec(ctx, `insert into student_profiles (tenant_id, user_id) values ($1, $2)`, w.tenantID, w.studentID)
	require.NoError(t, err)

	issued, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeClassroomEntry, IssuedByUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)

	result, err := svc.ScanClassroomEntry(ctx, service.ScanClassroomEntryInput{
		TenantID: w.tenantID, StudentUserID: w.studentID, RawToken: issued.RawValue, Reason: "Bangun kesiangan",
	})
	require.NoError(t, err)
	require.Equal(t, w.dutyTeacherID, result.TeacherUserID)

	require.Len(t, hub.userPublishes, 1)
	got := hub.userPublishes[0]
	require.Equal(t, w.dutyTeacherID, got.userID, "the push goes to the teacher who issued the token, not the student")
	require.Equal(t, "classroom_entry_scanned", got.eventType)

	requireClassroomEntryPayload(t, got.payload, w.studentID, uuid.NullUUID{UUID: w.classID, Valid: true})
}
