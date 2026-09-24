package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// fakeSessionCache records every session id it is asked to invalidate, so a
// test can assert the identity service evicts the authn middleware's
// validity cache (internal/platform/auth/sessioncache.go) instead of
// leaving a revoked session accepted for up to its TTL.
type invalidatedEntry struct {
	tenantID  uuid.UUID
	sessionID uuid.UUID
}

type fakeSessionCache struct {
	invalidated []invalidatedEntry
}

func (f *fakeSessionCache) Invalidate(_ context.Context, tenantID, sessionID uuid.UUID) error {
	f.invalidated = append(f.invalidated, invalidatedEntry{tenantID: tenantID, sessionID: sessionID})
	return nil
}

func (f *fakeSessionCache) has(id uuid.UUID) bool {
	for _, got := range f.invalidated {
		if got.sessionID == id {
			return true
		}
	}
	return false
}

// hasFor reports whether Invalidate was called with exactly this
// tenant/session pair, so a test can confirm the cache is invalidated
// scoped to the session's own tenant rather than an arbitrary one.
func (f *fakeSessionCache) hasFor(tenantID, sessionID uuid.UUID) bool {
	for _, got := range f.invalidated {
		if got.tenantID == tenantID && got.sessionID == sessionID {
			return true
		}
	}
	return false
}

// setupIdentityTest brings up the shared dbtest Postgres (migrated,
// including migration 0108, which removes platform_superadmin from the
// system admin role) and returns it alongside a service wired against
// AppPool -- the least-privilege app_rw role, so row level security
// applies exactly like production -- plus a fakeSessionCache the test can
// inspect. Fixture seeding must go through pg.AdminPool, never the pool
// backing svc. Shared by every _test.go file in this package.
func setupIdentityTest(t *testing.T) (pg dbtest.Postgres, svc *service.Service, cache *fakeSessionCache) {
	t.Helper()
	pg = dbtest.Start(t)
	repo := repository.New(pg.AppPool)
	cache = &fakeSessionCache{}
	svc = service.New(pg.AppPool, repo, nil, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{
		SessionCache: cache,
	})
	return pg, svc, cache
}

func insertTestTenant(t *testing.T, pool *pgxpool.Pool, slug string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(context.Background(),
		`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		 values ($1,'Test School','sma','UTC','id','active','default') returning id`, slug).Scan(&id)
	require.NoError(t, err)
	return id
}

func insertTestUser(t *testing.T, pool *pgxpool.Pool, tenantID uuid.UUID, username string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(context.Background(),
		`insert into users (tenant_id,username,email,password_hash,name,status,locale)
		 values ($1,$2,$2||'@example.test','x','Test User','active','id') returning id`, tenantID, username).Scan(&id)
	require.NoError(t, err)
	return id
}

// insertTestSession inserts an active (unrevoked) session row directly,
// bypassing Login so these tests exercise only the session-revoking
// methods under test.
func insertTestSession(t *testing.T, pool *pgxpool.Pool, tenantID, userID uuid.UUID, kind string, actorID uuid.NullUUID) uuid.UUID {
	t.Helper()
	_, hash, err := auth.NewRefreshToken()
	require.NoError(t, err)
	var id uuid.UUID
	err = pool.QueryRow(context.Background(),
		`insert into sessions (tenant_id,user_id,kind,actor_user_id,refresh_token_hash,family_id,client,expires_at)
		 values ($1,$2,$3,$4,$5,$6,'web',now()+interval '1 day') returning id`,
		tenantID, userID, kind, actorID, hash, uuid.New()).Scan(&id)
	require.NoError(t, err)
	return id
}

func sessionRevokedAt(t *testing.T, pool *pgxpool.Pool, sessionID uuid.UUID) *time.Time {
	t.Helper()
	var revokedAt *time.Time
	require.NoError(t, pool.QueryRow(context.Background(),
		`select revoked_at from sessions where id = $1`, sessionID).Scan(&revokedAt))
	return revokedAt
}

// TestLogoutInvalidatesSessionCache and its siblings below prove Logout,
// RevokeSession, and StopImpersonation evict the middleware's session
// cache immediately instead of only revoking the row in the database --
// the invariant documented in internal/platform/auth/sessioncache.go and
// already honoured by ChangePassword and password-reset confirm.
func TestLogoutInvalidatesSessionCache(t *testing.T) {
	pg, svc, cache := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "logout-test")
	userID := insertTestUser(t, pg.AdminPool, tenantID, "logoutuser")
	sessionID := insertTestSession(t, pg.AdminPool, tenantID, userID, "login", uuid.NullUUID{})

	require.NoError(t, svc.Logout(ctx, tenantID, userID, sessionID))

	require.True(t, cache.hasFor(tenantID, sessionID), "Logout must invalidate the session cache entry scoped to the session's tenant")
	require.NotNil(t, sessionRevokedAt(t, pg.AdminPool, sessionID), "Logout must revoke the session in the database")
}

func TestRevokeSessionInvalidatesSessionCache(t *testing.T) {
	pg, svc, cache := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "revoke-test")
	userID := insertTestUser(t, pg.AdminPool, tenantID, "revokeuser")
	current := insertTestSession(t, pg.AdminPool, tenantID, userID, "login", uuid.NullUUID{})
	other := insertTestSession(t, pg.AdminPool, tenantID, userID, "login", uuid.NullUUID{})

	require.NoError(t, svc.RevokeSession(ctx, tenantID, userID, other))

	require.True(t, cache.hasFor(tenantID, other), "RevokeSession must invalidate the revoked session's cache entry scoped to its tenant")
	require.False(t, cache.has(current), "RevokeSession must not invalidate an unrelated session")
	require.NotNil(t, sessionRevokedAt(t, pg.AdminPool, other))
	require.Nil(t, sessionRevokedAt(t, pg.AdminPool, current))
}

func TestStopImpersonationInvalidatesSessionCache(t *testing.T) {
	pg, svc, cache := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "impersonation-test")
	actorID := insertTestUser(t, pg.AdminPool, tenantID, "actoruser")
	targetID := insertTestUser(t, pg.AdminPool, tenantID, "targetuser")
	sessionID := insertTestSession(t, pg.AdminPool, tenantID, targetID, "impersonation", uuid.NullUUID{UUID: actorID, Valid: true})

	require.NoError(t, svc.StopImpersonation(ctx, tenantID, sessionID))

	require.True(t, cache.hasFor(tenantID, sessionID), "StopImpersonation must invalidate the impersonation session's cache entry scoped to its tenant")
	require.NotNil(t, sessionRevokedAt(t, pg.AdminPool, sessionID))
}

func TestStopImpersonationRejectsNonImpersonationSession(t *testing.T) {
	pg, svc, cache := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "not-impersonation-test")
	userID := insertTestUser(t, pg.AdminPool, tenantID, "loginuser")
	sessionID := insertTestSession(t, pg.AdminPool, tenantID, userID, "login", uuid.NullUUID{})

	err := svc.StopImpersonation(ctx, tenantID, sessionID)
	require.ErrorIs(t, err, domain.ErrNotImpersonating)
	require.False(t, cache.has(sessionID), "a rejected StopImpersonation call must not touch the cache")
}
