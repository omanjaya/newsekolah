package grading

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// recordedUserPublish captures one RealtimePublisher.PublishToUser call.
type recordedUserPublish struct {
	tenantID  uuid.UUID
	userID    uuid.UUID
	eventType string
	payload   any
}

// fakeRealtimeHub implements grading/service.RealtimePublisher without a
// real platform/realtime.Hub, so a test can assert exactly which
// students, event type, and payload Publish pushed to -- the plan's
// "fake hub asserting topic, type, and payload" (docs/analysis/
// realtime-plan-2026-09-25.md section 4, chunk C4's test row).
type fakeRealtimeHub struct {
	mu        sync.Mutex
	published []recordedUserPublish
}

func (f *fakeRealtimeHub) PublishToUser(_ context.Context, tenantID, userID uuid.UUID, eventType string, payload any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.published = append(f.published, recordedUserPublish{tenantID: tenantID, userID: userID, eventType: eventType, payload: payload})
	return nil
}

func (f *fakeRealtimeHub) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.published)
}

func requireGradingPublishedPayload(t *testing.T, payload any, wantClassID, wantSubjectID, wantTermID uuid.UUID) {
	t.Helper()
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	var got struct {
		ClassID   uuid.UUID `json:"class_id"`
		SubjectID uuid.UUID `json:"subject_id"`
		TermID    uuid.UUID `json:"term_id"`
	}
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, wantClassID, got.ClassID)
	require.Equal(t, wantSubjectID, got.SubjectID)
	require.Equal(t, wantTermID, got.TermID)
}

// buildGradingServiceWithRealtime constructs a *service.Service directly
// (bypassing Register, which only accepts a concrete *realtime.Hub), with
// hub standing in for the wired Hub -- mirrors permits'/attendance's own
// buildRealtimeTestService/buildServiceWithRealtime helpers.
func buildGradingServiceWithRealtime(pool *pgxpool.Pool, years service.AcademicYearReader, hub service.RealtimePublisher) *service.Service {
	return service.New(pool, repository.New(pool), years, nil, hub, clock.Real{})
}

// enrollSecondStudent enrolls one more student in fx's own class (the
// same joined_on date seedFixture itself uses), so a test can assert
// Publish's roster resolution covers every enrolled student, not just the
// fixture's original one.
func enrollSecondStudent(t *testing.T, pool *pgxpool.Pool, fx fixture) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	q := db.New(pool)
	student, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: fx.tenantID, Username: "siswa-kedua-" + uuid.NewString(), PasswordHash: "x", Name: "Siswa Kedua", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: fx.tenantID, AcademicYearID: fx.yearID, StudentUserID: student.ID, ClassID: fx.classID,
		JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)
	return student.ID
}

// TestPublishPushesToEveryEnrolledStudent covers opportunity #10
// (docs/analysis/realtime-plan-2026-09-25.md section 2): publishing a
// class-subject's grades must push every enrolled student's own topic,
// carrying only the class/subject/term ids.
func TestPublishPushesToEveryEnrolledStudent(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()
	secondStudentID := enrollSecondStudent(t, pg.AdminPool, fx)

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	hub := &fakeRealtimeHub{}
	svc := buildGradingServiceWithRealtime(pg.AppPool, schoolModule.Service, hub)

	out, err := svc.Publish(ctx, fx.tenantID, fx.teacherID, true, fx.classID, fx.subjectID,
		uuid.NullUUID{UUID: fx.termID, Valid: true}, true)
	require.NoError(t, err)

	require.Len(t, hub.published, 2, "both enrolled students must be pushed")
	byStudent := map[uuid.UUID]recordedUserPublish{}
	for _, p := range hub.published {
		byStudent[p.userID] = p
	}
	require.Contains(t, byStudent, fx.studentID)
	require.Contains(t, byStudent, secondStudentID)
	for _, studentID := range []uuid.UUID{fx.studentID, secondStudentID} {
		got := byStudent[studentID]
		require.Equal(t, fx.tenantID, got.tenantID)
		require.Equal(t, "grading.published", got.eventType)
		requireGradingPublishedPayload(t, got.payload, fx.classID, fx.subjectID, out.TermID)
	}
}

// TestPublishUnpublishingPushesNothing covers the other half: hiding a
// class-subject's grades (published=false) is not something a waiting
// student needs pushed -- only newly-visible grades are.
func TestPublishUnpublishingPushesNothing(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	hub := &fakeRealtimeHub{}
	svc := buildGradingServiceWithRealtime(pg.AppPool, schoolModule.Service, hub)

	_, err := svc.Publish(ctx, fx.tenantID, fx.teacherID, true, fx.classID, fx.subjectID,
		uuid.NullUUID{UUID: fx.termID, Valid: true}, false)
	require.NoError(t, err)
	require.Equal(t, 0, hub.count())
}

// TestPublishPublishesNothingWhenTransactionFails is the negative case:
// an actor who does not teach this class/subject and has no manage-any
// override is refused (ErrNotTeachingThisClass) before the publication
// flag ever changes, so nothing must reach the hub.
func TestPublishPublishesNothingWhenTransactionFails(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	hub := &fakeRealtimeHub{}
	svc := buildGradingServiceWithRealtime(pg.AppPool, schoolModule.Service, hub)

	_, err := svc.Publish(ctx, fx.tenantID, uuid.New(), false, fx.classID, fx.subjectID,
		uuid.NullUUID{UUID: fx.termID, Valid: true}, true)
	require.ErrorIs(t, err, domain.ErrNotTeachingThisClass)
	require.Equal(t, 0, hub.count())
}
