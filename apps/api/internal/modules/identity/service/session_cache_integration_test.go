package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/migrator"

	"github.com/jackc/pgx/v5/pgxpool"
)

// fakeSessionCache records every session id it is asked to invalidate, so a
// test can assert the identity service evicts the authn middleware's
// validity cache (internal/platform/auth/sessioncache.go) instead of
// leaving a revoked session accepted for up to its TTL.
type fakeSessionCache struct {
	invalidated []uuid.UUID
}

func (f *fakeSessionCache) Invalidate(_ context.Context, sessionID uuid.UUID) error {
	f.invalidated = append(f.invalidated, sessionID)
	return nil
}

func (f *fakeSessionCache) has(id uuid.UUID) bool {
	for _, got := range f.invalidated {
		if got == id {
			return true
		}
	}
	return false
}

// setupIdentityTest brings up a real Postgres in Docker, migrates it
// (including migration 0108, which removes platform_superadmin from the
// system admin role), and returns a service wired with a repository
// backed by that database plus a fakeSessionCache the test can inspect.
// Shared by every _test.go file in this package.
func setupIdentityTest(t *testing.T) (*pgxpool.Pool, *service.Service, *fakeSessionCache) {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test requires Docker")
	}
	ctx := context.Background()
	container, err := postgres.Run(ctx, "postgres:16-alpine",
		postgres.WithDatabase("identity"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Skipf("docker not available, skipping integration test: %v", err)
	}
	t.Cleanup(func() { _ = container.Terminate(context.Background()) })

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)
	pool, err := database.NewPool(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.NoError(t, migrator.UpAll(ctx, dsn, pool))

	repo := repository.New(pool)
	cache := &fakeSessionCache{}
	svc := service.New(pool, repo, nil, nil, nil, clock.Real{}, service.Config{}, auth.NewRefreshToken, service.Extras{
		SessionCache: cache,
	})
	return pool, svc, cache
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
	pool, svc, cache := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pool, "logout-test")
	userID := insertTestUser(t, pool, tenantID, "logoutuser")
	sessionID := insertTestSession(t, pool, tenantID, userID, "login", uuid.NullUUID{})

	require.NoError(t, svc.Logout(ctx, tenantID, userID, sessionID))

	require.True(t, cache.has(sessionID), "Logout must invalidate the session cache entry")
	require.NotNil(t, sessionRevokedAt(t, pool, sessionID), "Logout must revoke the session in the database")
}

func TestRevokeSessionInvalidatesSessionCache(t *testing.T) {
	pool, svc, cache := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pool, "revoke-test")
	userID := insertTestUser(t, pool, tenantID, "revokeuser")
	current := insertTestSession(t, pool, tenantID, userID, "login", uuid.NullUUID{})
	other := insertTestSession(t, pool, tenantID, userID, "login", uuid.NullUUID{})

	require.NoError(t, svc.RevokeSession(ctx, tenantID, userID, other))

	require.True(t, cache.has(other), "RevokeSession must invalidate the revoked session's cache entry")
	require.False(t, cache.has(current), "RevokeSession must not invalidate an unrelated session")
	require.NotNil(t, sessionRevokedAt(t, pool, other))
	require.Nil(t, sessionRevokedAt(t, pool, current))
}

func TestStopImpersonationInvalidatesSessionCache(t *testing.T) {
	pool, svc, cache := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pool, "impersonation-test")
	actorID := insertTestUser(t, pool, tenantID, "actoruser")
	targetID := insertTestUser(t, pool, tenantID, "targetuser")
	sessionID := insertTestSession(t, pool, tenantID, targetID, "impersonation", uuid.NullUUID{UUID: actorID, Valid: true})

	require.NoError(t, svc.StopImpersonation(ctx, tenantID, sessionID))

	require.True(t, cache.has(sessionID), "StopImpersonation must invalidate the impersonation session's cache entry")
	require.NotNil(t, sessionRevokedAt(t, pool, sessionID))
}

func TestStopImpersonationRejectsNonImpersonationSession(t *testing.T) {
	pool, svc, cache := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pool, "not-impersonation-test")
	userID := insertTestUser(t, pool, tenantID, "loginuser")
	sessionID := insertTestSession(t, pool, tenantID, userID, "login", uuid.NullUUID{})

	err := svc.StopImpersonation(ctx, tenantID, sessionID)
	require.ErrorIs(t, err, domain.ErrNotImpersonating)
	require.False(t, cache.has(sessionID), "a rejected StopImpersonation call must not touch the cache")
}
