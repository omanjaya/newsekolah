package staffattendance

import (
	"context"
	"encoding/json"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// recordedRealtimePublish captures one PublishRole call.
type recordedRealtimePublish struct {
	tenantID  uuid.UUID
	role      string
	eventType string
	payload   any
}

// fakeRealtimeHub implements staffattendance/service.RealtimePublisher
// without a real platform/realtime.Hub, so a test can assert exactly
// which topics, event type, and payload Scan published -- the plan's
// "fake hub asserting topic, type, and payload" (docs/analysis/
// realtime-plan-2026-09-25.md section 4, chunk C2's test row). This
// module has no realtime test at all before this chunk.
type fakeRealtimeHub struct {
	mu        sync.Mutex
	published []recordedRealtimePublish
}

func (f *fakeRealtimeHub) PublishRole(tenantID uuid.UUID, role, eventType string, payload any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.published = append(f.published, recordedRealtimePublish{tenantID: tenantID, role: role, eventType: eventType, payload: payload})
	return nil
}

func (f *fakeRealtimeHub) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.published)
}

func requireStaffAttendanceScannedPayload(t *testing.T, payload any, wantEmployeeID uuid.UUID) {
	t.Helper()
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	var got struct {
		EmployeeID uuid.UUID `json:"employee_id"`
	}
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, wantEmployeeID, got.EmployeeID)
}

// buildServiceWithRealtime constructs a *service.Service directly (bypassing
// module.Register, which only accepts a concrete *realtime.Hub) with hub
// standing in for the wired Hub -- mirrors permits' and attendance's own
// buildRealtimeTestService/buildServiceWithRealtime helpers.
func buildServiceWithRealtime(pool *pgxpool.Pool, hub service.RealtimePublisher) *service.Service {
	return service.New(pool, repository.New(pool), stubYears{}, stubCalendar{}, stubLeave{}, nil, hub)
}

// TestScanPublishesToAdminAndPrincipalRoleTopics covers opportunity #8
// (docs/analysis/realtime-plan-2026-09-25.md section 2): a self-service QR
// scan must push a live update to every role that default-holds a
// staff-attendance permission -- admin and principal (there is no "hr"
// role, and no duty type holds one) -- carrying only the employee id.
func TestScanPublishesToAdminAndPrincipalRoleTopics(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	adminQ := db.New(pg.AdminPool)

	tn, err := adminQ.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "staffattendance-realtime-" + uuid.NewString(), Name: "Realtime Test", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	employee, err := adminQ.CreateUser(ctx, db.CreateUserParams{
		TenantID: tn.ID, Username: "pegawai-" + uuid.NewString(), PasswordHash: "x", Name: "Pegawai Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	hub := &fakeRealtimeHub{}
	svc := buildServiceWithRealtime(pg.AppPool, hub)

	_, err = svc.Scan(ctx, tn.ID, employee.ID)
	require.NoError(t, err)

	require.Len(t, hub.published, 2)
	byRole := map[string]recordedRealtimePublish{}
	for _, p := range hub.published {
		byRole[p.role] = p
	}
	require.Contains(t, byRole, "admin")
	require.Contains(t, byRole, "principal")
	for _, role := range []string{"admin", "principal"} {
		got := byRole[role]
		require.Equal(t, tn.ID, got.tenantID)
		require.Equal(t, "staff_attendance.scanned", got.eventType)
		requireStaffAttendanceScannedPayload(t, got.payload, employee.ID)
	}
}

// TestScanPublishesNothingWhenModuleDisabled is the negative case: a
// disabled module must refuse the scan (ErrModuleDisabled) before
// upserting anything, so nothing must reach the hub.
func TestScanPublishesNothingWhenModuleDisabled(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	adminQ := db.New(pg.AdminPool)

	tn, err := adminQ.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "staffattendance-disabled-" + uuid.NewString(), Name: "Disabled Test", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	employee, err := adminQ.CreateUser(ctx, db.CreateUserParams{
		TenantID: tn.ID, Username: "pegawai-" + uuid.NewString(), PasswordHash: "x", Name: "Pegawai Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	_, err = pg.AdminPool.Exec(ctx, `insert into feature_flags (tenant_id, module, enabled) values ($1, 'staff_attendance', false)`, tn.ID)
	require.NoError(t, err)

	hub := &fakeRealtimeHub{}
	svc := buildServiceWithRealtime(pg.AppPool, hub)

	_, err = svc.Scan(ctx, tn.ID, employee.ID)
	require.ErrorIs(t, err, domain.ErrModuleDisabled)
	require.Equal(t, 0, hub.count(), "a rolled-back Scan must not publish anything")
}
