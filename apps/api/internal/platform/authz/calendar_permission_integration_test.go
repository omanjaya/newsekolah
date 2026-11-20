package authz_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// The school calendar's write routes require manage_calendar, split out of
// manage_academic_years: the principal (who sets holiday and exam dates)
// can add, edit and delete calendar events against the real bundled spec,
// but still cannot create or activate an academic year. The admin keeps
// both.
func TestCalendarPermission_PrincipalEditsCalendarNotYears(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	q := db.New(pg.AdminPool)

	doc, err := api.GetSpec()
	require.NoError(t, err)
	ops, err := authz.LoadOperationPermissions(doc)
	require.NoError(t, err)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "calendar-authz-test-" + uuid.NewString(), Name: "Calendar Authz Test",
		EducationLevel: "sma", Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	principal := seedRoleAndUser(t, ctx, q, tenantRow.ID, authz.RoleSlugPrincipal, "kepsek-calendar")
	admin := seedRoleAndUser(t, ctx, q, tenantRow.ID, authz.RoleSlugAdmin, "admin-calendar")
	provider := rlsPermissionProvider{pool: pg.AppPool}

	for _, operationID := range []string{"CreateCalendarEvent", "UpdateCalendarEvent", "DeleteCalendarEvent"} {
		require.NoError(t, authz.Authorize(ctx, ops, provider, operationID, principal),
			"principal must be able to call %s", operationID)
		require.NoError(t, authz.Authorize(ctx, ops, provider, operationID, admin),
			"admin must still be able to call %s", operationID)
	}
	for _, operationID := range []string{"CreateAcademicYear", "ActivateAcademicYear"} {
		require.Equal(t, httpx.ErrForbidden, authz.Authorize(ctx, ops, provider, operationID, principal),
			"principal must not be able to call %s", operationID)
		require.NoError(t, authz.Authorize(ctx, ops, provider, operationID, admin))
	}
}
