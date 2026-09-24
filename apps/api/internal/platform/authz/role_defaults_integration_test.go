// Package authz_test (external, not the internal authz_test.go-in-package
// convention the rest of this directory uses) is deliberate here: dbtest
// transitively imports migrator, which imports authz itself, so a test
// file living in "package authz" that also imports dbtest would create an
// import cycle the Go toolchain refuses to build. As an external test
// package, this file imports authz like any other consumer and the cycle
// never closes back onto itself.
package authz_test

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// rlsPermissionProvider computes a user's effective role permissions
// exactly the way identity/service.Service.EffectivePermissions does
// (role permissions unioned with active-duty permissions -- this fixture
// has no academic year, so it has no duties, leaving role permissions as
// the complete answer), through a real app_rw connection so row level
// security applies the same way it does in production.
type rlsPermissionProvider struct {
	pool *pgxpool.Pool
}

func (p rlsPermissionProvider) EffectivePermissions(ctx context.Context, tenantID, userID uuid.UUID) (authz.Set, error) {
	var codes []string
	err := database.WithTenantTx(ctx, p.pool, tenantID, func(ctx context.Context) error {
		tx, ok := database.TxFromContext(ctx)
		if !ok {
			return errors.New("tenant transaction missing from context")
		}
		rows, err := tx.Query(ctx, `
			select distinct rp.permission_code
			from user_roles ur
			join role_permissions rp on rp.role_id = ur.role_id
			where ur.user_id = $1
		`, userID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var code string
			if err := rows.Scan(&code); err != nil {
				return err
			}
			codes = append(codes, code)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return authz.NewSet(codes...), nil
}

// TestPrincipalRoleAuthorization proves the "principal" system role's
// default permissions (authz.RoleDefaults) really drive an allow/deny
// decision against a real Postgres database: a principal can reach a
// student-roster and a supervision-cycles operation, but is forbidden from
// a user-management and a tenant-settings operation, all through
// authz.Authorize -- the exact function every real endpoint runs behind
// (cmd/api/authz_middleware.go) -- rather than a hand-asserted permission
// set.
func TestPrincipalRoleAuthorization(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	q := db.New(pg.AdminPool)

	tenant, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "principal-authz-test-" + uuid.NewString(), Name: "Principal Authz Test",
		EducationLevel: "sma", Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	var principalRole db.Role
	found := false
	for _, rd := range authz.RoleDefaults() {
		if rd.Slug != authz.RoleSlugPrincipal {
			continue
		}
		found = true
		principalRole, err = q.CreateRole(ctx, db.CreateRoleParams{
			TenantID: tenant.ID, Slug: rd.Slug, Name: rd.Name, IsSystem: true,
		})
		require.NoError(t, err)
		for _, code := range rd.Permissions {
			require.NoError(t, q.AddRolePermission(ctx, db.AddRolePermissionParams{
				RoleID: principalRole.ID, PermissionCode: code, TenantID: tenant.ID,
			}))
		}
	}
	require.True(t, found, "principal role missing from RoleDefaults()")

	user, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenant.ID, Username: "kepsek-authz-test", PasswordHash: "x",
		Name: "Kepala Sekolah Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	require.NoError(t, q.AssignUserRole(ctx, db.AssignUserRoleParams{
		UserID: user.ID, RoleID: principalRole.ID, TenantID: tenant.ID, IsPrimary: true,
	}))

	provider := rlsPermissionProvider{pool: pg.AppPool}
	identity := authz.Identity{Authenticated: true, UserID: user.ID, TenantID: tenant.ID}

	doc, err := openapi3.NewLoader().LoadFromData([]byte(`
openapi: 3.1.0
info: { title: test, version: "1" }
paths:
  /students:
    get:
      operationId: listClassEnrollments
      x-permission: view_academic_data
      responses: { "200": { description: ok } }
  /supervision/cycles:
    get:
      operationId: listSupervisionCycles
      x-permission: view_supervision
      responses: { "200": { description: ok } }
  /users:
    get:
      operationId: listUsers
      x-permission: view_users
      responses: { "200": { description: ok } }
  /settings/grading-scale:
    put:
      operationId: updateGradingScale
      x-permission: manage_settings
      responses: { "200": { description: ok } }
`))
	require.NoError(t, err)
	ops, err := authz.LoadOperationPermissions(doc)
	require.NoError(t, err)

	require.NoError(t, authz.Authorize(ctx, ops, provider, "listClassEnrollments", identity),
		"principal must be able to list students (view_academic_data)")
	require.NoError(t, authz.Authorize(ctx, ops, provider, "listSupervisionCycles", identity),
		"principal must be able to list supervision cycles (view_supervision)")

	err = authz.Authorize(ctx, ops, provider, "listUsers", identity)
	require.Equal(t, httpx.ErrForbidden, err, "principal must not reach the user-management endpoint")
	forbidden, ok := err.(*httpx.Error)
	require.True(t, ok)
	require.Equal(t, http.StatusForbidden, forbidden.Status)

	err = authz.Authorize(ctx, ops, provider, "updateGradingScale", identity)
	require.Equal(t, httpx.ErrForbidden, err, "principal must not reach the tenant-settings endpoint")
}
