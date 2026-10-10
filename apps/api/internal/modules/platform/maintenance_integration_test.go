package platform

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

func newMaintenanceModule(t *testing.T, appPool *pgxpool.Pool, now time.Time, policy service.RetentionPolicy) *Module {
	t.Helper()
	return Register(Dependencies{
		Pool: appPool, Clock: clock.Frozen{At: now}, Mode: config.TenancyMulti, Retention: policy,
	})
}

func seedMaintenanceTenant(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := pool.Exec(context.Background(),
		`insert into tenants (id, slug, name, education_level, status) values ($1, $2, 'Maintenance School', 'sma', 'active')`,
		id, "maint-"+id.String()[:8])
	require.NoError(t, err)
	return id
}

func countRows(t *testing.T, pool *pgxpool.Pool, query string, args ...any) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), query, args...).Scan(&n))
	return n
}

// TestMaintenance_PartitionsAndRetention runs the real SQL functions as
// app_rw (the runtime role, which owns none of the tables): history in the
// DEFAULT partition is moved into monthly partitions without loss, the
// current and next two months exist, and retention drops whole expired
// partitions while keeping everything newer.
func TestMaintenance_PartitionsAndRetention(t *testing.T) {
	pg := dbtest.Start(t)
	runMaintenanceScenario(t, pg.AdminPool, pg.AppPool)
}

func runMaintenanceScenario(t *testing.T, adminPool, appPool *pgxpool.Pool) {
	t.Helper()
	pg := struct{ AdminPool, AppPool *pgxpool.Pool }{adminPool, appPool}
	ctx := context.Background()
	now := time.Now().UTC()
	tenantID := seedMaintenanceTenant(t, pg.AdminPool)

	// History older than the audit window and recent history, all landing in
	// the DEFAULT partition because no monthly partition exists for them.
	old := now.AddDate(0, -30, 0)
	recent := now.AddDate(0, -1, 0)
	for _, ts := range []time.Time{old, recent} {
		_, err := pg.AdminPool.Exec(ctx,
			`insert into audit_logs (tenant_id, action, entity_type, occurred_at) values ($1, 'test', 'x', $2)`, tenantID, ts)
		require.NoError(t, err)
	}

	mod := newMaintenanceModule(t, pg.AppPool, now, service.RetentionPolicy{AuditLogMonths: 24, LoginAttemptDays: 90, WebhookDeliveryDays: 30})

	require.NoError(t, mod.Maintenance.EnsurePartitions(ctx))
	require.NoError(t, mod.Maintenance.EnsurePartitions(ctx), "ensure must be idempotent")

	// Creating the partitions for the history months is what migration 0124
	// does for a real deployment: it must move the DEFAULT rows, as app_rw.
	for _, ts := range []time.Time{old, recent} {
		_, err := pg.AppPool.Exec(ctx, `select ensure_monthly_partition('audit_logs', $1::date)`, ts)
		require.NoError(t, err)
	}

	for _, table := range []string{service.TableAuditLogs, service.TableLoginAttempts} {
		for _, month := range service.PartitionMonths(now, 2) {
			name := service.PartitionName(table, month)
			require.Equal(t, 1, countRows(t, pg.AdminPool, `select count(*) from pg_class where relname = $1`, name), name)
		}
	}
	require.Zero(t, countRows(t, pg.AdminPool, `select count(*) from audit_logs_default where tenant_id = $1`, tenantID),
		"history must have moved out of the DEFAULT partition")
	require.Equal(t, 2, countRows(t, pg.AdminPool, `select count(*) from audit_logs where tenant_id = $1`, tenantID),
		"no row may be lost by the move")

	// Login attempts: one expired row inside a partition that is not wholly
	// expired (deleted by the batch delete), one fresh.
	partial := now.AddDate(0, 0, -100)
	fresh := now.AddDate(0, 0, -1)
	for _, ts := range []time.Time{partial, fresh} {
		_, err := pg.AdminPool.Exec(ctx,
			`insert into login_attempts (tenant_id, username, success, occurred_at) values ($1, 'u', true, $2)`, tenantID, ts)
		require.NoError(t, err)
	}

	require.NoError(t, mod.Maintenance.RunRetention(ctx))

	require.Equal(t, 1, countRows(t, pg.AdminPool, `select count(*) from audit_logs where tenant_id = $1`, tenantID),
		"the 30-month-old audit partition is dropped, the recent row stays")
	require.Equal(t, 1, countRows(t, pg.AdminPool, `select count(*) from login_attempts where tenant_id = $1`, tenantID),
		"only the login attempt inside the 90-day window remains")
}
