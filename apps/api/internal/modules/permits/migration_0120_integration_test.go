package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/migrator"
)

// indexDefFor returns pg_indexes.indexdef for indexName, so a test can
// assert which column a unique index is actually keyed on without parsing
// migration files.
func indexDefFor(t *testing.T, ctx context.Context, pool *pgxpool.Pool, indexName string) string {
	t.Helper()
	var def string
	require.NoError(t, pool.QueryRow(ctx, `select indexdef from pg_indexes where indexname = $1`, indexName).Scan(&def))
	return def
}

func hasColumn(t *testing.T, ctx context.Context, pool *pgxpool.Pool, table, column string) bool {
	t.Helper()
	var exists bool
	require.NoError(t, pool.QueryRow(ctx,
		`select exists (select 1 from information_schema.columns where table_name = $1 and column_name = $2)`,
		table, column,
	).Scan(&exists))
	return exists
}

// TestMigration0120_UpDownUp_PreservesAndRebuildsLocalDate exercises
// migration 0120 (workflow_instances.local_date plus
// ux_workflow_instances_one_exit_permit_per_day switching from
// opened_date to local_date) against a database that already holds an
// exit permit row: reversing it must restore the old opened_date-keyed
// index and drop local_date without disturbing the existing row, and
// reapplying it must bring local_date back with the exact same
// backfilled value, since opened_at and the tenant's timezone did not
// change in between.
func TestMigration0120_UpDownUp_PreservesAndRebuildsLocalDate(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLocalDateWorld(t, ctx, pg.AdminPool, "migration-0120-"+uuid.NewString())

	// 23:00 WITA on a known date -- a known tenant-local calendar day.
	at := time.Date(2026, time.June, 10, 15, 0, 0, 0, time.UTC)
	sync := &fakeAttendanceSync{}
	svc := buildExitPermitServiceWithClock(pg.AppPool, sync, clock.Frozen{At: at})

	inst, _, err := svc.CreateExitPermit(ctx, service.CreateExitPermitInput{
		TenantID: w.tenantID, StudentUserID: w.studentAID, Destination: "Puskesmas",
		StartPeriodID: w.startPeriodID, EndPeriodID: w.endPeriodID,
	})
	require.NoError(t, err)

	beforeLocalDate := localDateOf(t, ctx, pg.AdminPool, inst.ID)
	require.Equal(t, "2026-06-10", beforeLocalDate.Format("2006-01-02"))

	m, err := migrator.New(pg.DSN)
	require.NoError(t, err)
	t.Cleanup(func() { _, _ = m.Close() })

	// Down: local_date must be gone, and the unique index restored to
	// opened_date with the same status filter 0081 left it at.
	require.NoError(t, m.Steps(-1))

	require.False(t, hasColumn(t, ctx, pg.AdminPool, "workflow_instances", "local_date"),
		"local_date must be dropped by the down migration")

	downIndexDef := indexDefFor(t, ctx, pg.AdminPool, "ux_workflow_instances_one_exit_permit_per_day")
	require.Contains(t, downIndexDef, "opened_date")
	require.NotContains(t, downIndexDef, "local_date")

	// The pre-existing row must survive the round trip untouched.
	var status string
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select status from workflow_instances where id = $1`, inst.ID).Scan(&status))
	require.Equal(t, string(domain.StatusInProgress), status)

	// Up again: local_date must return, backfilled from opened_at and
	// the tenant's own timezone.
	require.NoError(t, m.Steps(1))

	require.True(t, hasColumn(t, ctx, pg.AdminPool, "workflow_instances", "local_date"),
		"local_date must be restored by reapplying the up migration")

	afterLocalDate := localDateOf(t, ctx, pg.AdminPool, inst.ID)
	require.Equal(t, beforeLocalDate.Format("2006-01-02"), afterLocalDate.Format("2006-01-02"),
		"the backfill must reconstruct the same tenant-local day the row originally carried")

	upIndexDef := indexDefFor(t, ctx, pg.AdminPool, "ux_workflow_instances_one_exit_permit_per_day")
	require.Contains(t, upIndexDef, "local_date")
	require.NotContains(t, upIndexDef, "opened_date")
}
