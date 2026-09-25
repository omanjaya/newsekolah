package attendance

import (
	"context"
	"encoding/json"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// recordedRolePublish captures one RealtimePublisher.PublishRole call.
type recordedRolePublish struct {
	tenantID  uuid.UUID
	role      string
	eventType string
	payload   any
}

// fakeRealtimeHub implements attendance/service.RealtimePublisher without
// a real platform/realtime.Hub, so a test can assert exactly which topic
// (role), event type, and payload SaveEntries published -- the plan's
// "fake hub asserting topic, type, and payload" (docs/analysis/
// realtime-plan-2026-09-25.md section 4, chunk C2's test row).
type fakeRealtimeHub struct {
	mu            sync.Mutex
	monitorCalls  int
	rolePublishes []recordedRolePublish
}

func (f *fakeRealtimeHub) PublishMonitor(uuid.UUID, any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.monitorCalls++
	return nil
}

func (f *fakeRealtimeHub) PublishRole(tenantID uuid.UUID, role, eventType string, payload any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rolePublishes = append(f.rolePublishes, recordedRolePublish{tenantID: tenantID, role: role, eventType: eventType, payload: payload})
	return nil
}

func (f *fakeRealtimeHub) totalPublishes() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.monitorCalls + len(f.rolePublishes)
}

// requireAttendanceSubmittedPayload asserts a recorded payload's shape via
// JSON round-trip rather than a type assertion: attendanceSubmittedRole
// Payload is unexported in the service package.
func requireAttendanceSubmittedPayload(t *testing.T, payload any, wantSessionID, wantClassID uuid.UUID) {
	t.Helper()
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	var got struct {
		SessionID uuid.UUID `json:"session_id"`
		ClassID   uuid.UUID `json:"class_id"`
	}
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, wantSessionID, got.SessionID)
	require.Equal(t, wantClassID, got.ClassID)
}

// buildServiceWithRealtime is buildService (attendance_integration_test.go)
// with a caller-supplied RealtimePublisher, so these tests exercise the
// same composition production uses (school/scheduling modules' own
// exported readers) with only the realtime publisher swapped for a fake.
func buildServiceWithRealtime(pool *pgxpool.Pool, realtime service.RealtimePublisher) *service.Service {
	schoolModule := school.Register(pool, tenant.ModeSingle, nil)
	eventBus := events.NewBus()
	schedulingModule := scheduling.Register(pool, eventBus, noopPerms{})
	repo := repository.New(pool)
	return service.New(
		pool, repo, schoolModule.Service, schedulingModule.ScheduleReader, schedulingModule.AccessChecker, schedulingModule.JournalService,
		NoOpBlocker{}, NoOpOverrider{}, NoOpViolationRecorder{}, NoOpDisciplineReader{}, nil, realtime, nil,
	)
}

// TestSaveEntriesPublishesToAdminAndPrincipalRoleTopics covers opportunity
// #6 (docs/analysis/realtime-plan-2026-09-25.md section 2): submitting a
// session must push a live nudge to both the admin and principal role
// topics, carrying only the session and class ids.
func TestSaveEntriesPublishesToAdminAndPrincipalRoleTopics(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	hub := &fakeRealtimeHub{}
	svc := buildServiceWithRealtime(pg.AppPool, hub)
	w := seedWorld(t, ctx, pg.AdminPool, "realtime-submit")

	actor := service.Actor{UserID: w.teacherID}
	opened, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)

	detail, err := svc.SaveEntries(ctx, w.tenantID, actor, opened.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: w.student1ID, StatusCode: "H"}},
	})
	require.NoError(t, err)

	require.Equal(t, 1, hub.monitorCalls, "the existing monitor push must be unaffected")
	require.Len(t, hub.rolePublishes, 2)

	roles := map[string]recordedRolePublish{}
	for _, p := range hub.rolePublishes {
		roles[p.role] = p
	}
	require.Contains(t, roles, "admin")
	require.Contains(t, roles, "principal")
	for _, role := range []string{"admin", "principal"} {
		got := roles[role]
		require.Equal(t, w.tenantID, got.tenantID)
		require.Equal(t, "attendance.submitted", got.eventType)
		requireAttendanceSubmittedPayload(t, got.payload, detail.Session.ID, detail.Session.ClassID)
	}
}

// TestSaveEntriesPublishesNothingWhenTransactionFails is the negative
// case: a student who is not enrolled in the session's class must refuse
// with ErrStudentNotInClass before ever submitting, so nothing must reach
// the hub.
func TestSaveEntriesPublishesNothingWhenTransactionFails(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	hub := &fakeRealtimeHub{}
	svc := buildServiceWithRealtime(pg.AppPool, hub)
	w := seedWorld(t, ctx, pg.AdminPool, "realtime-fail")

	actor := service.Actor{UserID: w.teacherID}
	opened, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)

	_, err = svc.SaveEntries(ctx, w.tenantID, actor, opened.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{{StudentUserID: uuid.New(), StatusCode: "H"}},
	})
	require.ErrorIs(t, err, domain.ErrStudentNotInClass)
	require.Equal(t, 0, hub.totalPublishes(), "a rolled-back SaveEntries must not publish anything")
}
