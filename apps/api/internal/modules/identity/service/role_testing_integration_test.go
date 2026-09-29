package service_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

type roleTestingFixture struct {
	svc       *service.Service
	clock     *adjustableClock
	pool      *pgxpool.Pool
	tenantID  uuid.UUID
	actorID   uuid.UUID
	firstID   uuid.UUID
	secondID  uuid.UUID
	rootID    uuid.UUID
	rootToken string
}

type adjustableClock struct{ at time.Time }

func (c *adjustableClock) Now() time.Time { return c.at }

func newRoleTestingFixture(t *testing.T) roleTestingFixture {
	t.Helper()
	pg := dbtest.Start(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "role-testing-"+uuid.NewString()[:8])
	actorID := insertTestUser(t, pg.AdminPool, tenantID, "role-admin")
	firstID := insertTestUser(t, pg.AdminPool, tenantID, "role-teacher-1")
	secondID := insertTestUser(t, pg.AdminPool, tenantID, "role-teacher-2")
	insertRole := func(slug, name string) uuid.UUID {
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx,
			`insert into roles (tenant_id,slug,name,is_system) values ($1,$2,$3,true) returning id`,
			tenantID, slug, name).Scan(&id))
		return id
	}
	superRole := insertRole("super_admin", "Super Admin")
	teacherRole := insertRole("teacher", "Teacher")
	_, err := pg.AdminPool.Exec(ctx, `insert into role_permissions (tenant_id,role_id,permission_code) values ($1,$2,'platform_superadmin')`, tenantID, superRole)
	require.NoError(t, err)
	for userID, roleID := range map[uuid.UUID]uuid.UUID{actorID: superRole, firstID: teacherRole, secondID: teacherRole} {
		_, err = pg.AdminPool.Exec(ctx, `insert into user_roles (tenant_id,user_id,role_id,is_primary) values ($1,$2,$3,true)`, tenantID, userID, roleID)
		require.NoError(t, err)
	}
	rootToken, hash, err := auth.NewRefreshToken()
	require.NoError(t, err)
	var rootID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`insert into sessions (tenant_id,user_id,kind,refresh_token_hash,family_id,client,expires_at)
		 values ($1,$2,'login',$3,$4,'web',now()+interval '1 day') returning id`,
		tenantID, actorID, hash, uuid.New()).Scan(&rootID))
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	sealer, err := crypto.NewSealer("test", "role-testing-secret-32-characters-minimum")
	require.NoError(t, err)
	clk := &adjustableClock{at: time.Now().UTC().Truncate(time.Second).Add(123456789 * time.Nanosecond)}
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), fixedYear{}, nil,
		auth.NewTokenIssuer(key, "test", 15*time.Minute), clk, service.Config{},
		auth.NewRefreshToken, service.Extras{MfaSealer: sealer})
	return roleTestingFixture{svc: svc, clock: clk, pool: pg.AdminPool, tenantID: tenantID, actorID: actorID,
		firstID: firstID, secondID: secondID, rootID: rootID, rootToken: rootToken}
}

func TestRoleTestingSwitchRefreshAndReturn(t *testing.T) {
	f := newRoleTestingFixture(t)
	ctx := context.Background()
	first, err := f.svc.StartRoleTesting(ctx, f.tenantID, f.actorID, f.rootID, f.firstID, f.rootToken, "teacher", "", "test")
	require.NoError(t, err)
	require.Equal(t, f.firstID, first.Auth.Me.UserID)
	require.NotNil(t, sessionRevokedAt(t, f.pool, f.rootID))

	proof, err := f.svc.DecodeRoleTestingProof(first.Proof)
	require.NoError(t, err)
	require.Equal(t, first.Auth.SessionID, proof.ChildSessionID)
	require.Equal(t, f.actorID, proof.ActorID)
	require.LessOrEqual(t, time.Until(first.Deadline), 30*time.Minute)

	refreshed, err := f.svc.RefreshRoleTesting(ctx, f.tenantID, first.Proof, first.Auth.RefreshToken)
	require.NoError(t, err)
	require.Equal(t, first.Auth.SessionID, refreshed.SessionID)
	require.Equal(t, first.Auth.RefreshToken, refreshed.RefreshToken)

	second, err := f.svc.SwitchRoleTesting(ctx, f.tenantID, first.Auth.SessionID, f.secondID, first.Proof, first.Auth.RefreshToken, "teacher", "", "test")
	require.NoError(t, err)
	require.Equal(t, f.secondID, second.Auth.Me.UserID)
	require.True(t, second.Deadline.Equal(first.Deadline))
	require.NotNil(t, sessionRevokedAt(t, f.pool, first.Auth.SessionID))
	_, err = f.svc.RefreshRoleTesting(ctx, f.tenantID, first.Proof, first.Auth.RefreshToken)
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)

	admin, err := f.svc.RestoreRoleTesting(ctx, f.tenantID, second.Proof, second.Auth.RefreshToken, "", "test")
	require.NoError(t, err)
	require.Equal(t, f.actorID, admin.Me.UserID)
	require.Nil(t, admin.Me.ImpersonatedBy)
	require.NotNil(t, sessionRevokedAt(t, f.pool, second.Auth.SessionID))
	require.NotNil(t, sessionRevokedAt(t, f.pool, proof.ParkedSessionID))
	_, err = f.svc.RestoreRoleTesting(ctx, f.tenantID, second.Proof, second.Auth.RefreshToken, "", "test")
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
}

func TestRoleTestingRejectsMissingPermissionAndWrongRole(t *testing.T) {
	f := newRoleTestingFixture(t)
	ctx := context.Background()
	_, err := f.svc.StartRoleTesting(ctx, f.tenantID, f.actorID, f.rootID, f.firstID, f.rootToken, "staff", "", "test")
	require.ErrorIs(t, err, domain.ErrRoleNotFound)
	_, err = f.pool.Exec(ctx, `delete from role_permissions where tenant_id = $1 and permission_code = 'platform_superadmin'`, f.tenantID)
	require.NoError(t, err)
	_, err = f.svc.StartRoleTesting(ctx, f.tenantID, f.actorID, f.rootID, f.firstID, f.rootToken, "teacher", "", "test")
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
	require.Nil(t, sessionRevokedAt(t, f.pool, f.rootID))
}

func TestRoleTestingStartConsumesRootSessionOnce(t *testing.T) {
	f := newRoleTestingFixture(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := f.svc.StartRoleTesting(ctx, f.tenantID, f.actorID, f.rootID, f.firstID, f.rootToken, "teacher", "", "test")
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else {
			require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
		}
	}
	require.Equal(t, 1, successes)
}

func TestRoleTestingProofRejectsTamperingTenantAndExpiry(t *testing.T) {
	f := newRoleTestingFixture(t)
	ctx := context.Background()
	started, err := f.svc.StartRoleTesting(ctx, f.tenantID, f.actorID, f.rootID, f.firstID, f.rootToken, "teacher", "", "test")
	require.NoError(t, err)
	_, err = f.svc.RestoreRoleTesting(ctx, f.tenantID, started.Proof+"x", started.Auth.RefreshToken, "", "test")
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
	otherTenant := insertTestTenant(t, f.pool, "role-proof-other-"+uuid.NewString()[:8])
	_, err = f.svc.RestoreRoleTesting(ctx, otherTenant, started.Proof, started.Auth.RefreshToken, "", "test")
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
	f.clock.at = started.Deadline.Add(time.Second)
	_, err = f.svc.RestoreRoleTesting(ctx, f.tenantID, started.Proof, started.Auth.RefreshToken, "", "test")
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
	require.Nil(t, sessionRevokedAt(t, f.pool, started.Auth.SessionID))
}

func TestRoleTestingOrdinaryImpersonationHasNoReturnProof(t *testing.T) {
	f := newRoleTestingFixture(t)
	ctx := context.Background()
	childToken, hash, err := auth.NewRefreshToken()
	require.NoError(t, err)
	var legacyID uuid.UUID
	require.NoError(t, f.pool.QueryRow(ctx,
		`insert into sessions (tenant_id,user_id,kind,actor_user_id,refresh_token_hash,family_id,client,expires_at)
		 values ($1,$2,'impersonation',$3,$4,$5,'web',now()+interval '30 minutes') returning id`,
		f.tenantID, f.firstID, f.actorID, hash, uuid.New()).Scan(&legacyID))
	state, err := f.svc.RoleTestingState(ctx, f.tenantID, f.firstID, legacyID,
		uuid.NullUUID{UUID: f.actorID, Valid: true}, "", childToken, "teacher", "", uuid.Nil)
	require.NoError(t, err)
	require.False(t, state.Available)
	require.False(t, state.Active)
	_, err = f.svc.RestoreRoleTesting(ctx, f.tenantID, "", childToken, "", "test")
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
}

func TestRoleTestingReturnConsumesProofOnce(t *testing.T) {
	f := newRoleTestingFixture(t)
	ctx := context.Background()
	started, err := f.svc.StartRoleTesting(ctx, f.tenantID, f.actorID, f.rootID, f.firstID, f.rootToken, "teacher", "", "test")
	require.NoError(t, err)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := f.svc.RestoreRoleTesting(ctx, f.tenantID, started.Proof, started.Auth.RefreshToken, "", "test")
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else {
			require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
		}
	}
	require.Equal(t, 1, successes)
}

func TestRoleTestingLogoutRevokesBothSessions(t *testing.T) {
	f := newRoleTestingFixture(t)
	ctx := context.Background()
	started, err := f.svc.StartRoleTesting(ctx, f.tenantID, f.actorID, f.rootID, f.firstID, f.rootToken, "teacher", "", "test")
	require.NoError(t, err)
	proof, err := f.svc.DecodeRoleTestingProof(started.Proof)
	require.NoError(t, err)
	require.NoError(t, f.svc.CancelRoleTesting(ctx, f.tenantID, started.Proof, started.Auth.RefreshToken))
	require.NotNil(t, sessionRevokedAt(t, f.pool, proof.ParkedSessionID))
	require.NotNil(t, sessionRevokedAt(t, f.pool, started.Auth.SessionID))
	_, err = f.svc.RestoreRoleTesting(ctx, f.tenantID, started.Proof, started.Auth.RefreshToken, "", "test")
	require.ErrorIs(t, err, service.ErrRoleTestingUnavailable)
}
