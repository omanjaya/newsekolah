package authz_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/migrations"
)

// TestStaffBillingMigration runs 0129_staff_billing_to_bursar_duty.up.sql
// against a tenant whose staff role still carries the old billing grants:
// the system staff role loses them, a custom role keeps them, and the
// tenant gets a bursar duty holding exactly view_billing and
// record_payments.
func TestStaffBillingMigration(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	q := db.New(pg.AdminPool)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "staff-billing-migration-" + uuid.NewString(), Name: "Staff Billing Migration Test",
		EducationLevel: "sma", Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	staffRole, err := q.CreateRole(ctx, db.CreateRoleParams{
		TenantID: tenantRow.ID, Slug: authz.RoleSlugStaff, Name: "Pegawai", IsSystem: true,
	})
	require.NoError(t, err)
	customRole, err := q.CreateRole(ctx, db.CreateRoleParams{
		TenantID: tenantRow.ID, Slug: "tata_usaha", Name: "Tata usaha", IsSystem: false,
	})
	require.NoError(t, err)
	for _, roleID := range []uuid.UUID{staffRole.ID, customRole.ID} {
		for _, code := range []string{authz.PermViewBilling, authz.PermRecordPayments, authz.PermViewVisitors} {
			require.NoError(t, q.AddRolePermission(ctx, db.AddRolePermissionParams{
				RoleID: roleID, PermissionCode: code, TenantID: tenantRow.ID,
			}))
		}
	}

	up, err := migrations.FS.ReadFile("0129_staff_billing_to_bursar_duty.up.sql")
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx, string(up))
	require.NoError(t, err)
	// Idempotent: a second run changes nothing and does not fail.
	_, err = pg.AdminPool.Exec(ctx, string(up))
	require.NoError(t, err)

	codes := func(query string, id uuid.UUID) []string {
		t.Helper()
		rows, err := pg.AdminPool.Query(ctx, query, id)
		require.NoError(t, err)
		defer rows.Close()
		var out []string
		for rows.Next() {
			var code string
			require.NoError(t, rows.Scan(&code))
			out = append(out, code)
		}
		require.NoError(t, rows.Err())
		return out
	}
	const rolePerms = `select permission_code from role_permissions where role_id = $1 order by permission_code`
	require.Equal(t, []string{authz.PermViewVisitors}, codes(rolePerms, staffRole.ID))
	require.Equal(t, []string{authz.PermRecordPayments, authz.PermViewBilling, authz.PermViewVisitors}, codes(rolePerms, customRole.ID))

	var bursarID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select id from duty_types where tenant_id = $1 and slug = 'bursar'`, tenantRow.ID).Scan(&bursarID))
	require.Equal(t, []string{authz.PermRecordPayments, authz.PermViewBilling},
		codes(`select permission_code from duty_permissions where duty_type_id = $1 order by permission_code`, bursarID))
}
