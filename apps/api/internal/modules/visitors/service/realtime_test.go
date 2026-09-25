package service_test

import (
	"context"
	"encoding/json"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// recordedRolePublish captures one RealtimePublisher.PublishRole call.
type recordedRolePublish struct {
	tenantID  uuid.UUID
	role      string
	eventType string
	payload   any
}

// fakeRealtimeHub implements visitors/service.RealtimePublisher without a
// real platform/realtime.Hub, so a test can assert exactly which roles,
// event type, and payload CheckIn/CheckOut published -- the plan's "fake
// hub asserting topic, type, and payload" (docs/analysis/
// realtime-plan-2026-09-25.md section 4, chunk C3's test row).
type fakeRealtimeHub struct {
	mu        sync.Mutex
	published []recordedRolePublish
}

func (f *fakeRealtimeHub) PublishRole(tenantID uuid.UUID, role, eventType string, payload any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.published = append(f.published, recordedRolePublish{tenantID: tenantID, role: role, eventType: eventType, payload: payload})
	return nil
}

func (f *fakeRealtimeHub) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.published)
}

func (f *fakeRealtimeHub) rolesFor(eventType string) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var roles []string
	for _, p := range f.published {
		if p.eventType == eventType {
			roles = append(roles, p.role)
		}
	}
	return roles
}

func requireVisitorBoardPayload(t *testing.T, payload any, wantVisitID uuid.UUID) {
	t.Helper()
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	var got struct {
		VisitID uuid.UUID `json:"visit_id"`
	}
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, wantVisitID, got.VisitID)
}

// stubYearsVisitors always answers "no active academic year": these tests
// are about the realtime push, not badge numbering, and Service.issueBadge
// falls back to a locally numbered badge with no PDF when Docs is nil.
type stubYearsVisitors struct{}

func (stubYearsVisitors) GetActiveAcademicYearID(context.Context, uuid.UUID) (uuid.UUID, bool, error) {
	return uuid.Nil, false, nil
}

func buildVisitorsServiceWithRealtime(pool *pgxpool.Pool, hub service.RealtimePublisher) *service.Service {
	return service.New(pool, repository.New(pool), stubYearsVisitors{}, nil, nil, nil, hub, nil, clock.Real{})
}

// seedVisitorsWorld is one tenant with one host user, enough to check a
// guest in and out.
func seedVisitorsWorld(t *testing.T, ctx context.Context, pool *pgxpool.Pool, slug string) (tenantID, hostUserID, guardUserID uuid.UUID) {
	t.Helper()
	q := db.New(pool)
	tn, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: slug, Name: slug, EducationLevel: "sma", Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	tenantID = tn.ID

	host, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "host-" + slug, PasswordHash: "x", Name: "Host Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	hostUserID = host.ID

	guard, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: "guard-" + slug, PasswordHash: "x", Name: "Satpam Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	guardUserID = guard.ID
	return tenantID, hostUserID, guardUserID
}

// wantVisitorBoardRoles mirrors service.visitorBoardRoles (unexported):
// every role that default-holds "view_visitors" per authz.RoleDefaults.
var wantVisitorBoardRoles = []string{"staff", "principal", "admin"}

// TestCheckInPublishesToVisitorBoardRoles covers opportunity #5 (docs/
// analysis/realtime-plan-2026-09-25.md section 2): signing a guest in
// must push a live update to every role that can see the gate board
// (staff, principal, admin -- no duty type holds view_visitors), carrying
// only the visit id.
func TestCheckInPublishesToVisitorBoardRoles(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenantID, hostUserID, guardUserID := seedVisitorsWorld(t, ctx, pg.AdminPool, "visitor-checkin-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildVisitorsServiceWithRealtime(pg.AppPool, hub)

	visit, err := svc.CheckIn(ctx, tenantID, guardUserID, service.CheckInInput{
		FullName: "Tamu Test", HostUserID: hostUserID, Purpose: "Rapat", IDType: domain.IDTypeNone,
	})
	require.NoError(t, err)

	require.Len(t, hub.published, len(wantVisitorBoardRoles))
	require.ElementsMatch(t, wantVisitorBoardRoles, hub.rolesFor("visitor.checked_in"))
	for _, p := range hub.published {
		require.Equal(t, tenantID, p.tenantID)
		require.Equal(t, "visitor.checked_in", p.eventType)
		requireVisitorBoardPayload(t, p.payload, visit.ID)
	}
}

// TestCheckInPublishesNothingOnInvalidInput is the negative case: an
// empty full name refuses with ErrInvalidInput before ever opening the
// transaction, so nothing must reach the hub.
func TestCheckInPublishesNothingOnInvalidInput(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenantID, hostUserID, guardUserID := seedVisitorsWorld(t, ctx, pg.AdminPool, "visitor-checkin-fail-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildVisitorsServiceWithRealtime(pg.AppPool, hub)

	_, err := svc.CheckIn(ctx, tenantID, guardUserID, service.CheckInInput{
		FullName: "", HostUserID: hostUserID, Purpose: "Rapat", IDType: domain.IDTypeNone,
	})
	require.ErrorIs(t, err, domain.ErrInvalidInput)
	require.Equal(t, 0, hub.count())
}

// TestCheckOutPublishesToVisitorBoardRoles covers the other half of
// opportunity #5: signing a guest back out must also push the board's
// roles.
func TestCheckOutPublishesToVisitorBoardRoles(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenantID, hostUserID, guardUserID := seedVisitorsWorld(t, ctx, pg.AdminPool, "visitor-checkout-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildVisitorsServiceWithRealtime(pg.AppPool, hub)

	visit, err := svc.CheckIn(ctx, tenantID, guardUserID, service.CheckInInput{
		FullName: "Tamu Test", HostUserID: hostUserID, Purpose: "Rapat", IDType: domain.IDTypeNone,
	})
	require.NoError(t, err)
	require.Len(t, hub.published, len(wantVisitorBoardRoles), "check-in above already published once per role")

	_, err = svc.CheckOut(ctx, tenantID, visit.ID, guardUserID)
	require.NoError(t, err)

	require.Len(t, hub.published, 2*len(wantVisitorBoardRoles))
	require.ElementsMatch(t, wantVisitorBoardRoles, hub.rolesFor("visitor.checked_out"))
	for _, p := range hub.published {
		if p.eventType != "visitor.checked_out" {
			continue
		}
		requireVisitorBoardPayload(t, p.payload, visit.ID)
	}
}

// TestCheckOutPublishesNothingWhenAlreadyCheckedOut is the negative case:
// checking out a visit twice refuses the second time
// (ErrVisitAlreadyCheckedOut), so nothing more must reach the hub.
func TestCheckOutPublishesNothingWhenAlreadyCheckedOut(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenantID, hostUserID, guardUserID := seedVisitorsWorld(t, ctx, pg.AdminPool, "visitor-checkout-fail-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildVisitorsServiceWithRealtime(pg.AppPool, hub)

	visit, err := svc.CheckIn(ctx, tenantID, guardUserID, service.CheckInInput{
		FullName: "Tamu Test", HostUserID: hostUserID, Purpose: "Rapat", IDType: domain.IDTypeNone,
	})
	require.NoError(t, err)
	_, err = svc.CheckOut(ctx, tenantID, visit.ID, guardUserID)
	require.NoError(t, err)
	before := hub.count()

	_, err = svc.CheckOut(ctx, tenantID, visit.ID, guardUserID)
	require.ErrorIs(t, err, domain.ErrVisitAlreadyCheckedOut)
	require.Equal(t, before, hub.count(), "a rolled-back second check-out must not publish anything more")
}
