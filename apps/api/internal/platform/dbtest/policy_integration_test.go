package dbtest_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestTenantPoliciesTolerateEmptiedTenantSetting guards migration 0110:
// every policy that reads app.tenant_id must wrap it in nullif, because a
// pooled connection that has run one tenant transaction reports ” rather
// than NULL afterwards, and a plain ::uuid cast of ” raises 22P02. A new
// migration that copies the old policy form fails here instead of in
// production.
func TestTenantPoliciesTolerateEmptiedTenantSetting(t *testing.T) {
	pg := dbtest.Start(t)

	rows, err := pg.AdminPool.Query(context.Background(), `
		select tablename, policyname
		from pg_policies
		where (coalesce(qual, '') || coalesce(with_check, '')) like '%app.tenant_id%'
		  and (coalesce(qual, '') || coalesce(with_check, '')) not ilike '%nullif%'
		order by tablename, policyname`)
	require.NoError(t, err)
	defer rows.Close()

	var unsafe []string
	for rows.Next() {
		var table, policy string
		require.NoError(t, rows.Scan(&table, &policy))
		unsafe = append(unsafe, table+"."+policy)
	}
	require.NoError(t, rows.Err())
	require.Empty(t, unsafe, "policies casting app.tenant_id without nullif")
}
