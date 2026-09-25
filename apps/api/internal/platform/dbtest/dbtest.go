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
	"testing"

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

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	adminPool, err := database.NewPool(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(adminPool.Close)

	require.NoError(t, migrator.UpAll(ctx, dsn, adminPool))

	appPool, err := database.NewPool(ctx, RestrictedConnString(dsn, "app_rw", AppRWPassword))
	require.NoError(t, err)
	t.Cleanup(appPool.Close)

	return Postgres{DSN: dsn, AdminPool: adminPool, AppPool: appPool}
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
