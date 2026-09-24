package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// forcedStatusCall records one AttendanceSync.ForceStatus invocation, so a
// test can assert IssueLeaveLetter actually pushed the forced status
// across the leave's covered dates instead of only recording the permits
// side (status, letter, event) -- see the NOT WIRED note on
// service.AttendanceSync.
type forcedStatusCall struct {
	studentUserID      uuid.UUID
	from, to           time.Time
	statusCode, reason string
}

// fakeAttendanceSync is a minimal AttendanceSync test double: it just
// records every call rather than touching attendance_entries (the
// attendance module's own tables), which this module must not reach into
// directly per docs/03-layered-architecture.md.
type fakeAttendanceSync struct {
	calls []forcedStatusCall
}

func (f *fakeAttendanceSync) ForceStatus(_ context.Context, _, studentUserID uuid.UUID, from, to time.Time, statusCode, reason string) error {
	f.calls = append(f.calls, forcedStatusCall{studentUserID: studentUserID, from: from, to: to, statusCode: statusCode, reason: reason})
	return nil
}

// leaveWorld is one tenant fully seeded for the leave-request lifecycle:
// a class with one enrolled student, a homeroom teacher holding the
// class-scoped "homeroom" duty (satisfies the default definition's first
// stage, approver_rule "homeroom_of_student"), and a counselor holding the
// school-scoped "counselor" duty (satisfies the second and final stage,
// approver_rule "duty:counselor"). Evidence is pre-disabled via
// tenant_policies so the test can exercise the workflow transitions
// without also standing up the evidence-upload pipeline (storage
// presign/get/put), which is unrelated to what this test covers.
type leaveWorld struct {
	tenantID, yearID, classID                 uuid.UUID
	studentID, homeroomTeacherID, counselorID uuid.UUID
}

func seedLeaveWorld(t *testing.T, ctx context.Context, pool *pgxpool.Pool, slug string) leaveWorld {
	t.Helper()
	q := db.New(pool)
	var w leaveWorld

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

	homeroomTeacher, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "homeroom-" + slug, PasswordHash: "x", Name: "Wali Kelas Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.homeroomTeacherID = homeroomTeacher.ID

	counselor, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "counselor-" + slug, PasswordHash: "x", Name: "Guru BK Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.counselorID = counselor.ID

	student, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "student-" + slug, PasswordHash: "x", Name: "Siswa Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	w.studentID = student.ID

	class, err := q.CreateClass(ctx, db.CreateClassParams{TenantID: w.tenantID, AcademicYearID: w.yearID, GradeLevelID: gradeLevelID, Name: "X-A"})
	require.NoError(t, err)
	w.classID = class.ID

	// classes has no sqlc write query exposed for homeroom_teacher_id
	// (see attendance/attendance_integration_test.go's seedWorld doc
	// comment on the same gap): set it directly so
	// GetActiveEnrollment.HomeroomTeacherID.Valid is true, which
	// SubmitLeaveRequest requires (ErrHomeroomTeacherRequired otherwise).
	_, err = pool.Exec(ctx, `update classes set homeroom_teacher_id = $1 where tenant_id = $2 and id = $3`,
		w.homeroomTeacherID, w.tenantID, w.classID)
	require.NoError(t, err)

	_, err = pool.Exec(ctx,
		`insert into enrollments (tenant_id, academic_year_id, student_user_id, class_id, status, joined_on) values ($1, $2, $3, $4, 'active', current_date)`,
		w.tenantID, w.yearID, w.studentID, w.classID,
	)
	require.NoError(t, err)

	homeroomDutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{TenantID: w.tenantID, Slug: "homeroom", Name: "Wali Kelas", ScopeKind: "class"})
	require.NoError(t, err)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, DutyTypeID: homeroomDutyType.ID, UserID: w.homeroomTeacherID,
		ScopeClassID: database.NullUUID(uuid.NullUUID{UUID: w.classID, Valid: true}),
		StartsOn:     database.Date(time.Now().AddDate(0, 0, -30)),
	})
	require.NoError(t, err)

	counselorDutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{TenantID: w.tenantID, Slug: "counselor", Name: "Guru BK", ScopeKind: "school"})
	require.NoError(t, err)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, DutyTypeID: counselorDutyType.ID, UserID: w.counselorID,
		StartsOn: database.Date(time.Now().AddDate(0, 0, -30)),
	})
	require.NoError(t, err)

	// Disable the "evidence_required" tenant policy up front (default is
	// true) so this test exercises the approve/issue transitions without
	// also standing up the evidence-upload pipeline, which is a separate
	// concern from the workflow-completion regression this test covers.
	_, err = pool.Exec(ctx,
		`insert into tenant_policies (tenant_id, kind, version, config, effective_from) values ($1, 'permits', 1, $2, current_date)`,
		w.tenantID, []byte(`{"evidence_required": false}`),
	)
	require.NoError(t, err)

	return w
}

func buildLeaveService(pool *pgxpool.Pool, sync service.AttendanceSync) *service.Service {
	schoolModule := school.Register(pool, tenant.ModeSingle, nil)
	mod := Register(Dependencies{
		Pool: pool, Years: schoolModule.Service, Sync: sync, Clock: clock.Real{},
		Config: service.Config{DocumentSigningKey: []byte("a-test-signing-key"), EvidenceMaxBytes: 6 << 20},
	})
	return mod.Service
}

// TestLeaveRequestLifecycleCompletesAndUnblocksNextRequest is the
// regression test for cd37e06: before that fix, IssueLeaveLetter left the
// workflow instance at status 'approved', which
// GetInProgressWorkflowInstance (queries/workflow_instances.sql) treats as
// still open, so a student could never submit a second leave request once
// their first had been issued a letter -- every later SubmitLeaveRequest
// call failed with ErrAlreadyInProgress (409) forever. This exercises the
// full lifecycle through the Service (not the HTTP layer) against a real
// Postgres: submit as the student, homeroom-teacher approval of the first
// (non-final) stage, counselor issuance of the letter at the final stage,
// and asserts every side effect issuance is documented to have: the
// instance reaches 'completed' (not 'approved'), the leave_requests row
// carries the letter number/issued_at/issued_by, attendance is forced for
// the covered dates, and -- the actual regression -- a brand new leave
// request for the same student can now be submitted.
func TestLeaveRequestLifecycleCompletesAndUnblocksNextRequest(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLeaveWorld(t, ctx, pg.AdminPool, "leave-lifecycle-"+uuid.NewString())

	sync := &fakeAttendanceSync{}
	svc := buildLeaveService(pg.AppPool, sync)

	starts := time.Now().UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
	ends := starts.Add(24 * time.Hour)

	// 1. Submit as the student themselves -- the default definition's
	// stages (homeroom, counselor) carry no guardian_of_student stage, so
	// there is no guardian-submission path to exercise here.
	submitted, err := svc.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategorySick, StartsOn: starts, EndsOn: ends,
	})
	require.NoError(t, err)
	require.Equal(t, domain.StatusInProgress, submitted.Instance.Status)
	require.Equal(t, 0, submitted.Instance.CurrentStageIndex)
	instanceID := submitted.Instance.ID

	// While this first request is still in progress, a second submission
	// for the same student must be refused with ErrAlreadyInProgress
	// (409), not silently create a competing instance.
	_, err = svc.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategorySick, StartsOn: starts, EndsOn: ends,
	})
	require.ErrorIs(t, err, domain.ErrAlreadyInProgress, "a second submission while one is in progress must be refused")

	// 2. Homeroom teacher approves the first (non-final) stage.
	reviewed, err := svc.ReviewLeaveRequest(ctx, w.tenantID, instanceID, w.homeroomTeacherID, true, "disetujui wali kelas")
	require.NoError(t, err)
	require.Equal(t, domain.StatusInProgress, reviewed.Instance.Status, "approving a non-final stage must not close the instance")
	require.Equal(t, 1, reviewed.Instance.CurrentStageIndex, "must have advanced to the counselor stage")

	// 3. Counselor issues the letter at the final stage.
	issued, err := svc.IssueLeaveLetter(ctx, w.tenantID, instanceID, w.counselorID)
	require.NoError(t, err)

	require.Equal(t, domain.StatusCompleted, issued.Instance.Status, "issuing the letter must complete the instance, not leave it 'approved'")
	require.NotNil(t, issued.Instance.ClosedAt, "a completed instance must carry a closed_at")

	require.NotEmpty(t, issued.LeaveRequest.LetterNumber)
	require.NotNil(t, issued.LeaveRequest.IssuedAt)
	require.True(t, issued.LeaveRequest.IssuedBy.Valid)
	require.Equal(t, w.counselorID, issued.LeaveRequest.IssuedBy.UUID)
	require.True(t, issued.LeaveRequest.IsIssued())

	// Attendance for the covered dates must have been forced.
	require.Len(t, sync.calls, 1, "issuing the letter must force attendance exactly once")
	call := sync.calls[0]
	require.Equal(t, w.studentID, call.studentUserID)
	require.Equal(t, "S", call.statusCode, "category sick must map to forced status S")
	require.WithinDuration(t, starts, call.from, time.Second)
	require.WithinDuration(t, ends.Add(24*time.Hour-time.Second), call.to, time.Second)

	// Re-fetch from storage to confirm the persisted row (not just the
	// in-memory return value) reflects the same state.
	persisted, err := svc.GetLeaveRequest(ctx, w.tenantID, instanceID)
	require.NoError(t, err)
	require.Equal(t, domain.StatusCompleted, persisted.Instance.Status)
	require.Equal(t, issued.LeaveRequest.LetterNumber, persisted.LeaveRequest.LetterNumber)

	// 4. The actual regression: a brand new leave request for the same
	// student must now be submittable -- before cd37e06 this failed with
	// ErrAlreadyInProgress forever, since GetInProgressWorkflowInstance
	// treats 'approved' as still open and issuance never moved the
	// instance past it.
	again, err := svc.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategoryDispensation, StartsOn: starts.Add(72 * time.Hour), EndsOn: starts.Add(96 * time.Hour),
	})
	require.NoError(t, err, "a completed leave request must not block a new submission for the same student")
	require.NotEqual(t, instanceID, again.Instance.ID)
	require.Equal(t, domain.StatusInProgress, again.Instance.Status)

	// And, symmetrically, while that second request is itself in
	// progress, a third submission is refused the same way the first was.
	_, err = svc.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategorySick, StartsOn: starts.Add(72 * time.Hour), EndsOn: starts.Add(96 * time.Hour),
	})
	require.ErrorIs(t, err, domain.ErrAlreadyInProgress)
}
