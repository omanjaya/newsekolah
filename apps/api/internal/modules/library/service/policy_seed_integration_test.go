package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestDefaultPolicySeededOnReadIsDatedInRealTime reads the circulation
// policy of a school that has none yet at a simulated date: the default
// policy that read stores carries the real date, as every other module's
// seeded policy does, so a simulated read leaves no simulated date in the
// stored data.
func TestDefaultPolicySeededOnReadIsDatedInRealTime(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 0)
	realTime := circulationServiceAt(t, pg.AppPool, "2026-12-15T01:00:00Z")

	_, err := realTime.Policy(at(t, ctx, "2027-03-01T01:00:00Z"), w.tenantID)
	require.NoError(t, err)

	var effectiveFrom time.Time
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select effective_from from library_policies where tenant_id = $1`, w.tenantID).Scan(&effectiveFrom))
	require.Equal(t, "2026-12-15", effectiveFrom.Format(time.DateOnly))
}
