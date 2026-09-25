package main

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	librarydomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/telemetry"
)

// TestBootstrapCreatesUsableTenant is the end-to-end regression test for
// the production bug this session fixed: a tenant created by `run` (this
// command's own entry point, package-private but directly callable from a
// test in the same package) must come out of it with every system role,
// every default duty type, and every default library member type --
// not just the super_admin role this command creates by hand -- so an
// admin can grant the teacher/student/staff/librarian/admin roles
// and name a homeroom/counselor/picket/leadership/security/librarian duty
// immediately, without waiting for a later `migrate` run.
//
// run() reads its database connection from DATABASE_URL like the real
// binary does, so this test points that at the container's app_rw
// connection (dbtest.AppRWPassword) -- the same restricted, RLS-enforced
// role a real deployment's bootstrap step actually connects as (see
// run()'s own comment on why a plain insert under app_rw needs
// app.tenant_id set, which is exactly what this exercises for real).
func TestBootstrapCreatesUsableTenant(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)

	t.Setenv("DATABASE_URL", dbtest.RestrictedConnString(pg.DSN, "app_rw", dbtest.AppRWPassword))
	t.Setenv("JWT_SIGNING_KEY", "test-jwt-signing-key-0123456789")
	t.Setenv("DOCUMENT_SIGNING_KEY", "test-document-signing-key-0123456789")

	slug := "bootstrap-e2e-" + uuid.NewString()
	logger := telemetry.NewLogger()
	require.NoError(t, run(logger, slug, "Bootstrap E2E School", "sma", "admin", "Admin Bootstrap", ""))

	q := db.New(pg.AdminPool)
	tenant, err := q.GetTenantBySlug(ctx, slug)
	require.NoError(t, err)

	roles, err := q.ListRolesByTenant(ctx, tenant.ID)
	require.NoError(t, err)
	gotSlugs := map[string]bool{}
	for _, r := range roles {
		gotSlugs[r.Slug] = true
	}
	for _, rd := range authz.RoleDefaults() {
		require.Truef(t, gotSlugs[rd.Slug], "role %s missing after bootstrap", rd.Slug)
	}

	duties, err := q.ListDutyTypes(ctx, db.ListDutyTypesParams{TenantID: tenant.ID, IncludeInactive: true})
	require.NoError(t, err)
	gotDutySlugs := map[string]bool{}
	for _, d := range duties {
		gotDutySlugs[d.Slug] = true
	}
	for _, dd := range authz.DutyTypeDefaults() {
		require.Truef(t, gotDutySlugs[dd.Slug], "duty type %s missing after bootstrap", dd.Slug)
	}

	memberTypes, err := q.ListMemberTypes(ctx, tenant.ID)
	require.NoError(t, err)
	gotRoles := map[string]bool{}
	for _, m := range memberTypes {
		if m.DefaultForRole.Valid {
			gotRoles[m.DefaultForRole.String] = true
		}
	}
	for _, md := range librarydomain.MemberTypeDefaults() {
		require.Truef(t, gotRoles[md.DefaultForRole], "library member type for role %s missing after bootstrap", md.DefaultForRole)
	}

	// The admin user exists and holds the "admin" role bootstrap did not
	// used to be able to grant it (RoleSlugAdmin was entirely missing
	// before this session's fix).
	user, err := q.GetUserByUsername(ctx, db.GetUserByUsernameParams{TenantID: tenant.ID, Username: "admin"})
	require.NoError(t, err)
	roleSlugs, err := q.ListUserRoleSlugs(ctx, user.ID)
	require.NoError(t, err)
	require.Contains(t, roleSlugs, authz.RoleSlugSuperAdmin)
}
