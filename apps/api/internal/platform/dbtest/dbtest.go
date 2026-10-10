// Package dbtest is the shared integration-test harness every
// *_integration_test.go file in this module uses to bring up a real
// Postgres in Docker: one container, every migration applied, and two
// pools with different privileges.
//
// AdminPool connects as the container's initdb superuser (testcontainers'
// bootstrap user), the same role migrator.UpAll runs migrations as. It
// bypasses row level security unconditionally (see migration 0004's
// comment on why a superuser connection always does, FORCE ROW LEVEL
// SECURITY notwithstanding) -- fixture seeding may use it freely, the way
// a one-off admin script or a migration itself would.
//
// AppPool connects as app_rw, the least-privilege, non-superuser,
// non-BYPASSRLS runtime role every production deployment actually points
// its DATABASE_URL at (migration 0004, docs/06-database-schema.md section
// 1). Row level security is enforced on it exactly like production.
// Service and handler code under test must run against AppPool, never
// AdminPool -- otherwise a test can pass only because it silently bypassed
// the same RLS policy that would deny the query in production.
package dbtest

import (
	"context"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/migrator"
)

// AppRWPassword matches the fixed password migration 0004 assigns app_rw
// when it provisions the role (safe here: a disposable Docker container
// nothing else ever connects to, not a production credential). Exported so
// a test that needs to build its own app_rw DATABASE_URL against this
// harness's container -- e.g. cmd/bootstrap's end-to-end test, which opens
// its own pool from an env var rather than taking AppPool directly -- does
// not have to duplicate the literal.
const AppRWPassword = "change-me-in-production"

// Postgres is a running test database, ready for both fixture seeding and
// exercising the code under test through the same RLS policies production
// runs under.
type Postgres struct {
	// DSN is the superuser connection string (host/port/db match AppPool's
	// too; only the credentials differ), for callers that need to build
	// their own restricted connection string, e.g. a role other than
	// app_rw.
	DSN string
	// AdminPool is the superuser pool: migrations and fixture seeding.
	AdminPool *pgxpool.Pool
	// AppPool is the app_rw pool: hand this to the service/handler
	// construction under test, never AdminPool.
	AppPool *pgxpool.Pool
}

// Start brings up Postgres 16, applies every migration (which also
// provisions app_rw, migration 0004), and returns both pools. Every
// integration test using this skips instead of failing when Docker is not
// reachable, and skips entirely under `go test -short`.
func Start(t *testing.T) Postgres {
	t.Helper()
	if testing.Short() {
		t.Skip("skipping integration test in -short mode")
	}

	ctx := context.Background()
	dsn, ok := externalDSN(t)
	if !ok {
		container, err := postgres.Run(ctx, "postgres:16-alpine",
			postgres.WithDatabase("newsekolah"),
			postgres.WithUsername("newsekolah"),
			postgres.WithPassword("newsekolah"),
			postgres.BasicWaitStrategies(),
		)
		if err != nil {
			t.Skipf("docker not available, skipping integration test: %v", err)
		}
		t.Cleanup(func() { _ = container.Terminate(context.Background()) })

		dsn, err = container.ConnectionString(ctx, "sslmode=disable")
		require.NoError(t, err)
	}

	adminPool, err := database.NewPool(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(adminPool.Close)

	require.NoError(t, migrator.UpAll(ctx, dsn, adminPool))

	appPool, err := database.NewPool(ctx, RestrictedConnString(dsn, "app_rw", AppRWPassword))
	require.NoError(t, err)
	t.Cleanup(appPool.Close)

	return Postgres{DSN: dsn, AdminPool: adminPool, AppPool: appPool}
}

// ExternalDSNEnv names an optional environment variable holding a superuser
// DSN (postgres://user:password@host:port/db) of an already running
// Postgres 16, for machines without Docker. Start then creates a fresh
// throwaway database on that server per test instead of starting a
// container, so tests stay isolated from each other.
const ExternalDSNEnv = "NEWSEKOLAH_TEST_PG_DSN"

// externalDSN creates a fresh database on the server named by
// ExternalDSNEnv and returns its DSN; ok is false when the variable is
// unset.
func externalDSN(t *testing.T) (dsn string, ok bool) {
	t.Helper()
	base := os.Getenv(ExternalDSNEnv)
	if base == "" {
		return "", false
	}
	ctx := context.Background()
	parsed, err := url.Parse(base)
	require.NoError(t, err)

	admin, err := pgx.Connect(ctx, base)
	require.NoError(t, err)
	defer func() { _ = admin.Close(ctx) }()

	name := "t_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	_, err = admin.Exec(ctx, "create database "+name)
	require.NoError(t, err)
	t.Cleanup(func() {
		conn, err := pgx.Connect(context.Background(), base)
		if err != nil {
			return
		}
		defer func() { _ = conn.Close(context.Background()) }()
		_, _ = conn.Exec(context.Background(), "drop database if exists "+name+" with (force)")
	})

	parsed.Path = "/" + name
	return parsed.String(), true
}

// RestrictedConnString swaps the user:password in a Postgres DSN while
// keeping host/port/db/query the same (testcontainers' ConnectionString
// always has the form postgres://user:password@host:port/db?query).
// Exported for tests that need a role other than app_rw (e.g.
// TestTenantIsolationRLS's read-only app_rw_test).
func RestrictedConnString(dsn, user, password string) string {
	at := -1
	for i := len("postgres://"); i < len(dsn); i++ {
		if dsn[i] == '@' {
			at = i
			break
		}
	}
	return "postgres://" + user + ":" + password + dsn[at:]
}
