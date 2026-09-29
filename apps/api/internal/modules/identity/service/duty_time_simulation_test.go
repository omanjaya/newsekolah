package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestEffectivePermissionsFollowsSimulatedDutyWindow proves
// EffectivePermissions -- identity/service.loadPrincipal's duty half, fed
// by duties.sql's ListActiveDutyAssignmentsForUser and
// session_active.sql's ListActiveDutyAssignmentsWithPermissions -- decides
// which duty assignments (and their permissions) are active from the
// request's business date: the simulated time when one is attached to ctx
// (clock.WithTime, as cmd/api's simulation middleware does for an
// authorized superadmin, including while impersonating), the real date
// otherwise. A duty scoped to a future starts_on/ends_on window is
// invisible under the real clock and becomes active only once the
// simulated date falls inside that window, then invisible again past it.
func TestEffectivePermissionsFollowsSimulatedDutyWindow(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool

	tenantID := insertTestTenant(t, pool, "duty-window-sim")
	userID := insertTestUser(t, pool, tenantID, "duty-holder")

	var yearID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31') returning id`,
		tenantID).Scan(&yearID))

	var dutyTypeID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'picket_sim','Piket Simulasi','school') returning id`,
		tenantID).Scan(&dutyTypeID))

	permCode := authz.PermCorrectAttendance
	_, err := pool.Exec(ctx,
		`insert into duty_permissions (duty_type_id,permission_code,tenant_id) values ($1,$2,$3)`,
		dutyTypeID, permCode, tenantID)
	require.NoError(t, err)

	startsOn := time.Now().UTC().AddDate(0, 0, 10)
	endsOn := startsOn.AddDate(0, 0, 10)
	_, err = pool.Exec(ctx,
		`insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,starts_on,ends_on)
		 values ($1,$2,$3,$4,$5,$6)`,
		tenantID, yearID, dutyTypeID, userID, startsOn.Format("2006-01-02"), endsOn.Format("2006-01-02"))
	require.NoError(t, err)

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{id: yearID}, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{})

	// The real clock: today is before the duty's starts_on, so neither the
	// duty nor the permission it grants shows up.
	real, err := svc.EffectivePermissions(ctx, tenantID, userID)
	require.NoError(t, err)
	require.False(t, real.Has(permCode), "a duty starting in the future must not be active under the real clock")

	// A simulated date inside [starts_on, ends_on]: the duty and its
	// permission become active for this request only.
	insideWindow := startsOn.AddDate(0, 0, 3)
	simCtx := clock.WithTime(ctx, insideWindow)
	active, err := svc.EffectivePermissions(simCtx, tenantID, userID)
	require.NoError(t, err)
	require.True(t, active.Has(permCode), "a simulated date inside the duty's window must activate its permission")

	// A simulated date past ends_on: inactive again.
	afterWindow := endsOn.AddDate(0, 0, 1)
	simCtxAfter := clock.WithTime(ctx, afterWindow)
	after, err := svc.EffectivePermissions(simCtxAfter, tenantID, userID)
	require.NoError(t, err)
	require.False(t, after.Has(permCode), "a simulated date past ends_on must deactivate the duty again")

	// Unsimulated requests are never affected by any of the above.
	stillReal, err := svc.EffectivePermissions(ctx, tenantID, userID)
	require.NoError(t, err)
	require.False(t, stillReal.Has(permCode), "a request with no simulated time attached must keep using the real clock")
}

// TestSimulatedTimeNeverExtendsSessionLifetime proves authentication stays
// on the real clock even when a simulated business time is attached to
// ctx: IsSessionActive (the authn middleware's session-validity check)
// must not be swayed by clock.WithTime, so a superadmin cannot use time
// simulation to resurrect an already-expired session.
func TestSimulatedTimeNeverExtendsSessionLifetime(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	pool := pg.AdminPool

	tenantID := insertTestTenant(t, pool, "session-real-time")
	userID := insertTestUser(t, pool, tenantID, "session-user")

	_, hash, err := auth.NewRefreshToken()
	require.NoError(t, err)
	var expiredSessionID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`insert into sessions (tenant_id,user_id,kind,refresh_token_hash,family_id,client,expires_at)
		 values ($1,$2,'login',$3,$4,'web',now()-interval '1 hour') returning id`,
		tenantID, userID, hash, uuid.New()).Scan(&expiredSessionID))

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{}, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{})

	active, err := svc.IsSessionActive(ctx, tenantID, expiredSessionID)
	require.NoError(t, err)
	require.False(t, active, "an expired session must be inactive under the real clock")

	// Simulate a time back when the session was still within its
	// lifetime: IsSessionActive must still report it inactive, because
	// session validity is never computed from the simulated clock.
	pastButWithinLifetime := time.Now().UTC().Add(-2 * time.Hour)
	simCtx := clock.WithTime(ctx, pastButWithinLifetime)
	stillInactive, err := svc.IsSessionActive(simCtx, tenantID, expiredSessionID)
	require.NoError(t, err)
	require.False(t, stillInactive, "simulated time must never make an expired session active again")
}
