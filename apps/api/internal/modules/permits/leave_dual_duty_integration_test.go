package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestLeaveQueueForHomeroomTeacherWhoIsAlsoCounselor covers a teacher who
// holds both the homeroom duty of X-A and a Guru BK duty. At the counselor
// stage they must be able to issue the letter of a request another
// homeroom teacher approved, and must not be offered one they approved
// themselves at the homeroom stage: the stage's distinct_from refuses
// them, so listing it left a card nobody could act on.
func TestLeaveQueueForHomeroomTeacherWhoIsAlsoCounselor(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLeaveWorld(t, ctx, pg.AdminPool, "leave-dual-"+uuid.NewString())
	q := db.New(pg.AdminPool)
	dual := w.homeroomTeacherID

	var counselorDutyTypeID, homeroomDutyTypeID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select id from duty_types where tenant_id = $1 and slug = 'counselor'`, w.tenantID).Scan(&counselorDutyTypeID))
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select id from duty_types where tenant_id = $1 and slug = 'homeroom'`, w.tenantID).Scan(&homeroomDutyTypeID))
	_, err := q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, DutyTypeID: counselorDutyTypeID, UserID: dual,
		StartsOn: database.Date(time.Now().AddDate(0, 0, -30)),
	})
	require.NoError(t, err)

	// A second class, X-B, with its own homeroom teacher and student.
	var gradeLevelID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select grade_level_id from classes where id = $1`, w.classID).Scan(&gradeLevelID))
	classB, err := q.CreateClass(ctx, db.CreateClassParams{TenantID: w.tenantID, AcademicYearID: w.yearID, GradeLevelID: gradeLevelID, Name: "X-B"})
	require.NoError(t, err)
	homeroomB, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "homeroom-b-" + uuid.NewString(), PasswordHash: "x", Name: "Wali X-B", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	studentB, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "student-b-" + uuid.NewString(), PasswordHash: "x", Name: "Rina", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx, `update classes set homeroom_teacher_id = $1 where id = $2`, homeroomB.ID, classB.ID)
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx,
		`insert into enrollments (tenant_id, academic_year_id, student_user_id, class_id, status, joined_on) values ($1, $2, $3, $4, 'active', current_date)`,
		w.tenantID, w.yearID, studentB.ID, classB.ID)
	require.NoError(t, err)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, DutyTypeID: homeroomDutyTypeID, UserID: homeroomB.ID,
		ScopeClassID: database.NullUUID(uuid.NullUUID{UUID: classB.ID, Valid: true}),
		StartsOn:     database.Date(time.Now().AddDate(0, 0, -30)),
	})
	require.NoError(t, err)

	svc := buildLeaveService(pg.AppPool, &fakeAttendanceSync{})
	day := time.Now().UTC().Truncate(24*time.Hour).AddDate(0, 0, 3)
	submitAndReview := func(student, reviewer uuid.UUID) uuid.UUID {
		t.Helper()
		submitted, err := svc.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
			TenantID: w.tenantID, ActorUserID: student, StudentUserID: student,
			Category: domain.CategorySick, StartsOn: day, EndsOn: day,
		})
		require.NoError(t, err)
		_, err = svc.ReviewLeaveRequest(ctx, w.tenantID, submitted.Instance.ID, reviewer, true, "")
		require.NoError(t, err)
		return submitted.Instance.ID
	}
	own := submitAndReview(w.studentID, dual)
	other := submitAndReview(studentB.ID, homeroomB.ID)

	queue, err := svc.ListLeaveRequestsForReview(ctx, w.tenantID, dual, uuid.NullUUID{})
	require.NoError(t, err)
	require.Len(t, queue, 1, "the request the teacher approved as homeroom is not theirs to issue")
	require.Equal(t, other, queue[0].InstanceID)
	require.NotNil(t, queue[0].AwaitingLetter)
	require.True(t, *queue[0].AwaitingLetter, "the row offers the letter, not a review the API would refuse")

	count, err := svc.CountLeaveRequestsForReview(ctx, w.tenantID, dual)
	require.NoError(t, err)
	require.Equal(t, 1, count, "the inbox badge matches the list")

	counselorQueue, err := svc.ListLeaveRequestsForReview(ctx, w.tenantID, w.counselorID, uuid.NullUUID{})
	require.NoError(t, err)
	require.Len(t, counselorQueue, 2, "the other counselor still sees both")

	_, err = svc.IssueLeaveLetter(ctx, w.tenantID, own, dual)
	require.ErrorIs(t, err, domain.ErrApproverNotDistinct)
	issued, err := svc.IssueLeaveLetter(ctx, w.tenantID, other, dual)
	require.NoError(t, err, "the teacher acts at the BK stage on a request someone else approved")
	require.Equal(t, domain.StatusCompleted, issued.Instance.Status)
}
