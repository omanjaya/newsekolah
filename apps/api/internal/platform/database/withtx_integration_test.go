package database_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestWithTenantTxRollsBackOnPanic is the regression test for a
// transaction that committed half its writes when a callee panicked: the
// deferred commit only looked at the named error, which a panic leaves nil.
// A library return whose event subscriber panicked answered 500 while the
// return itself was already saved, so the librarian's retry failed with
// "loan not found".
func TestWithTenantTxRollsBackOnPanic(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()

	var tenantID uuid.UUID
	slug := "withtx-panic-" + uuid.NewString()[:8]
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ($1,$1,'sma','UTC','id','active','default') returning id`, slug).Scan(&tenantID))

	username := "withtx-" + uuid.NewString()[:8]
	require.PanicsWithValue(t, "subscriber exploded", func() {
		_ = database.WithTenantTx(ctx, pg.AppPool, tenantID, func(ctx context.Context) error {
			tx, ok := database.TxFromContext(ctx)
			require.True(t, ok)
			_, err := tx.Exec(ctx, `insert into users (tenant_id,username,password_hash,name,status,locale)
				values ($1,$2,'x',$2,'active','id')`, tenantID, username)
			require.NoError(t, err)
			panic("subscriber exploded")
		})
	})

	var count int
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select count(*) from users where username = $1`, username).Scan(&count))
	require.Zero(t, count, "a panic inside the transaction must roll its writes back, not commit them")
}
