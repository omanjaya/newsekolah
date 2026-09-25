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

// TestGradingViewPermission_PrincipalReadsButNeverWrites proves the
// grading module's view_grades split (openapi/modules/grading.yaml) really
// drives authz.Authorize against the real bundled spec (api.GetSpec, the
// same doc cmd/api/wire.go loads), not just a synthetic one: a principal
// (RoleDefaults' principal, which carries view_grades but not
// manage_grades) can reach every read operation the task calls out
// (gradebook, its export, and the e-Rapor preview/export) but is forbidden
// from the two write operations that still gate on manage_grades alone
// (saving scores, publishing) -- reusing rlsPermissionProvider from
// role_defaults_integration_test.go so the permission lookup goes through
// a real app_rw connection and row level security the same way production
// does.
func TestGradingViewPermission_PrincipalReadsButNeverWrites(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	q := db.New(pg.AdminPool)

	doc, err := api.GetSpec()
	require.NoError(t, err)
	ops, err := authz.LoadOperationPermissions(doc)
	require.NoError(t, err)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "grading-view-authz-test-" + uuid.NewString(), Name: "Grading View Authz Test",
		EducationLevel: "sma", Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	principalIdentity := seedRoleAndUser(t, ctx, q, tenantRow.ID, authz.RoleSlugPrincipal, "kepsek-view-grades")

	provider := rlsPermissionProvider{pool: pg.AppPool}

	// oapi-codegen capitalizes the operationId it keeps for Go identifier
	// generation, and that capitalized string is what ends up embedded in
	// api.GetSpec() and what authzStrictMiddleware (cmd/api/
	// authz_middleware.go) actually passes to Authorize at runtime -- not
	// the literal lower-camel-case spelling in openapi/modules/
	// grading.yaml.
	for _, operationID := range []string{
		"GetGradebook", "ExportGradebook", "PreviewEraporExport", "ExportErapor", "ExportEraporLegacy",
		"ListGradeRanges", "ListTPMappings",
	} {
		require.NoError(t, authz.Authorize(ctx, ops, provider, operationID, principalIdentity),
			"principal (view_grades) must be able to call %s", operationID)
	}

	for _, operationID := range []string{
		"SaveComponentScores", "SetGradePublication", "CreateAssessmentComponent",
		"UpdateAssessmentComponent", "DeleteAssessmentComponent", "SetManualReportScore",
	} {
		err := authz.Authorize(ctx, ops, provider, operationID, principalIdentity)
		require.Equal(t, httpx.ErrForbidden, err, "principal (view_grades only) must be forbidden from %s", operationID)
	}
}

// TestGradingViewPermission_TeacherAndAdminUnaffected proves introducing
// view_grades never narrows what a teacher or an admin could already do:
// both still hold manage_grades (admin through RoleDefaults' "all minus
// two exclusions", teacher explicitly), so both must still pass every
// grading operation -- read and write alike -- exactly as before this
// change.
func TestGradingViewPermission_TeacherAndAdminUnaffected(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	q := db.New(pg.AdminPool)

	doc, err := api.GetSpec()
	require.NoError(t, err)
	ops, err := authz.LoadOperationPermissions(doc)
	require.NoError(t, err)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "grading-view-authz-test-" + uuid.NewString(), Name: "Grading View Authz Test 2",
		EducationLevel: "sma", Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	teacherIdentity := seedRoleAndUser(t, ctx, q, tenantRow.ID, authz.RoleSlugTeacher, "guru-view-grades")
	adminIdentity := seedRoleAndUser(t, ctx, q, tenantRow.ID, authz.RoleSlugAdmin, "admin-view-grades")

	provider := rlsPermissionProvider{pool: pg.AppPool}

	for _, identity := range []authz.Identity{teacherIdentity, adminIdentity} {
		for _, operationID := range []string{
			"GetGradebook", "ExportGradebook", "PreviewEraporExport", "ExportErapor",
			"SaveComponentScores", "SetGradePublication", "CreateAssessmentComponent",
		} {
			require.NoError(t, authz.Authorize(ctx, ops, provider, operationID, identity),
				"role of user %s must still be able to call %s", identity.UserID, operationID)
		}
	}
}

// seedRoleAndUser creates one of RoleDefaults()'s system roles for
// tenantID (with its default permissions) and one user assigned to it,
// returning the authz.Identity a real request from that user would carry.
func seedRoleAndUser(t *testing.T, ctx context.Context, q *db.Queries, tenantID uuid.UUID, slug, username string) authz.Identity {
	t.Helper()

	var role db.Role
	found := false
	for _, rd := range authz.RoleDefaults() {
		if rd.Slug != slug {
			continue
		}
		found = true
		created, err := q.CreateRole(ctx, db.CreateRoleParams{
			TenantID: tenantID, Slug: rd.Slug, Name: rd.Name, IsSystem: true,
		})
		require.NoError(t, err)
		role = created
		for _, code := range rd.Permissions {
			require.NoError(t, q.AddRolePermission(ctx, db.AddRolePermissionParams{
				RoleID: role.ID, PermissionCode: code, TenantID: tenantID,
			}))
		}
	}
	require.True(t, found, "%s is not in RoleDefaults()", slug)

	user, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantID, Username: username + "-" + uuid.NewString(), PasswordHash: "x",
		Name: username, Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	require.NoError(t, q.AssignUserRole(ctx, db.AssignUserRoleParams{
		UserID: user.ID, RoleID: role.ID, TenantID: tenantID, IsPrimary: true,
	}))

	return authz.Identity{Authenticated: true, UserID: user.ID, TenantID: tenantID}
}
