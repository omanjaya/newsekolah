// Package migrator_test is deliberately external (not "package migrator"):
// dbtest transitively imports migrator, so a same-package test file that
// also imports dbtest would be an import cycle. See
// authz/role_defaults_integration_test.go's identical note.
package migrator_test

import (
	"context"
	"sort"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	librarydomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/migrator"
)

// createTenant is a small fixture helper: a bare tenant row, no roles.
func createTenant(t *testing.T, ctx context.Context, pool *pgxpool.Pool, slug string) db.Tenant {
	t.Helper()
	tenant, err := db.New(pool).CreateTenant(ctx, db.CreateTenantParams{
		Slug: slug, Name: "Test " + slug, EducationLevel: "sma",
		Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	return tenant
}

// seedSuperAdminOnly reproduces exactly what cmd/bootstrap creates today: a
// "super_admin" system role carrying every permission in the catalog, and
// nothing else. This is the exact starting point that produced the
// production bug (docs task: a tenant created by cmd/bootstrap has only
// super_admin and, after 0117_principal_role, "principal" -- no
// teacher/staff/student/parent/librarian/admin role, and no duty types).
func seedSuperAdminOnly(t *testing.T, ctx context.Context, pool *pgxpool.Pool, tenantID uuid.UUID) {
	t.Helper()
	q := db.New(pool)
	role, err := q.CreateRole(ctx, db.CreateRoleParams{
		TenantID: tenantID, Slug: authz.RoleSlugSuperAdmin, Name: "Super Admin", IsSystem: true,
	})
	require.NoError(t, err)
	for _, code := range authz.Codes() {
		require.NoError(t, q.AddRolePermission(ctx, db.AddRolePermissionParams{
			RoleID: role.ID, PermissionCode: code, TenantID: tenantID,
		}))
	}
}

func sortedStrings(ss []string) []string {
	out := append([]string(nil), ss...)
	sort.Strings(out)
	return out
}

func roleBySlug(t *testing.T, roles []db.Role, slug string) db.Role {
	t.Helper()
	for _, r := range roles {
		if r.Slug == slug {
			return r
		}
	}
	t.Fatalf("role %q not found", slug)
	return db.Role{}
}

func dutyTypeBySlug(t *testing.T, duties []db.DutyType, slug string) db.DutyType {
	t.Helper()
	for _, d := range duties {
		if d.Slug == slug {
			return d
		}
	}
	t.Fatalf("duty type %q not found", slug)
	return db.DutyType{}
}

func memberTypeByRole(t *testing.T, types []db.LibraryMemberType, role string) db.LibraryMemberType {
	t.Helper()
	for _, m := range types {
		if m.DefaultForRole.Valid && m.DefaultForRole.String == role {
			return m
		}
	}
	t.Fatalf("library member type for role %q not found", role)
	return db.LibraryMemberType{}
}

// TestEnsureTenantDefaults_FillsBootstrapGaps is the direct regression test
// for the production bug: a tenant created the way cmd/bootstrap creates
// one (super_admin only) must end up with every other system role, every
// default duty type, and every default library member type once
// EnsureTenantDefaults runs, each with its full default permission set.
func TestEnsureTenantDefaults_FillsBootstrapGaps(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)

	tenant := createTenant(t, ctx, pg.AdminPool, "bootstrap-gaps-"+uuid.NewString())
	seedSuperAdminOnly(t, ctx, pg.AdminPool, tenant.ID)

	require.NoError(t, migrator.EnsureTenantDefaults(ctx, pg.AppPool, tenant.ID))

	q := db.New(pg.AdminPool)

	roles, err := q.ListRolesByTenant(ctx, tenant.ID)
	require.NoError(t, err)

	gotSlugs := map[string]bool{}
	for _, r := range roles {
		gotSlugs[r.Slug] = true
	}
	for _, rd := range authz.RoleDefaults() {
		require.Truef(t, gotSlugs[rd.Slug], "role %s missing after EnsureTenantDefaults", rd.Slug)
	}

	for _, rd := range authz.RoleDefaults() {
		if rd.Slug == authz.RoleSlugSuperAdmin {
			continue // pre-existing, untouched by design -- covered by the "never touches existing" test.
		}
		role := roleBySlug(t, roles, rd.Slug)
		require.True(t, role.IsSystem, "role %s must be a system role", rd.Slug)
		require.Equal(t, rd.Name, role.Name)
		codes, err := q.ListRolePermissionCodes(ctx, db.ListRolePermissionCodesParams{TenantID: tenant.ID, RoleID: role.ID})
		require.NoError(t, err)
		require.Equal(t, sortedStrings(rd.Permissions), sortedStrings(codes), "role %s permission set", rd.Slug)
	}

	duties, err := q.ListDutyTypes(ctx, db.ListDutyTypesParams{TenantID: tenant.ID, IncludeInactive: true})
	require.NoError(t, err)
	for _, dd := range authz.DutyTypeDefaults() {
		duty := dutyTypeBySlug(t, duties, dd.Slug)
		require.Equal(t, dd.Name, duty.Name)
		codes, err := q.ListDutyPermissionCodes(ctx, db.ListDutyPermissionCodesParams{TenantID: tenant.ID, DutyTypeID: duty.ID})
		require.NoError(t, err)
		require.Equal(t, sortedStrings(dd.Permissions), sortedStrings(codes), "duty %s permission set", dd.Slug)
	}

	memberTypes, err := q.ListMemberTypes(ctx, tenant.ID)
	require.NoError(t, err)
	for _, md := range librarydomain.MemberTypeDefaults() {
		mt := memberTypeByRole(t, memberTypes, md.DefaultForRole)
		require.Equal(t, md.Name, mt.Name)
		require.Equal(t, int32(md.MaxLoanItems), mt.MaxLoanItems)
		require.Equal(t, int32(md.MaxLoanDays), mt.MaxLoanDays)
	}
}

// TestEnsureTenantDefaults_Idempotent proves a second run changes nothing:
// no duplicate roles, duty types, member types, or permission grants.
func TestEnsureTenantDefaults_Idempotent(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)

	tenant := createTenant(t, ctx, pg.AdminPool, "idempotent-"+uuid.NewString())
	seedSuperAdminOnly(t, ctx, pg.AdminPool, tenant.ID)

	require.NoError(t, migrator.EnsureTenantDefaults(ctx, pg.AppPool, tenant.ID))

	q := db.New(pg.AdminPool)
	rolesBefore, err := q.ListRolesByTenant(ctx, tenant.ID)
	require.NoError(t, err)
	dutiesBefore, err := q.ListDutyTypes(ctx, db.ListDutyTypesParams{TenantID: tenant.ID, IncludeInactive: true})
	require.NoError(t, err)
	membersBefore, err := q.ListMemberTypes(ctx, tenant.ID)
	require.NoError(t, err)
	permsBefore := map[string][]string{}
	for _, r := range rolesBefore {
		codes, err := q.ListRolePermissionCodes(ctx, db.ListRolePermissionCodesParams{TenantID: tenant.ID, RoleID: r.ID})
		require.NoError(t, err)
		permsBefore[r.Slug] = sortedStrings(codes)
	}

	require.NoError(t, migrator.EnsureTenantDefaults(ctx, pg.AppPool, tenant.ID))

	rolesAfter, err := q.ListRolesByTenant(ctx, tenant.ID)
	require.NoError(t, err)
	dutiesAfter, err := q.ListDutyTypes(ctx, db.ListDutyTypesParams{TenantID: tenant.ID, IncludeInactive: true})
	require.NoError(t, err)
	membersAfter, err := q.ListMemberTypes(ctx, tenant.ID)
	require.NoError(t, err)

	require.Len(t, rolesAfter, len(rolesBefore), "role count must not change on a second run")
	require.Len(t, dutiesAfter, len(dutiesBefore), "duty type count must not change on a second run")
	require.Len(t, membersAfter, len(membersBefore), "library member type count must not change on a second run")
	for _, r := range rolesAfter {
		codes, err := q.ListRolePermissionCodes(ctx, db.ListRolePermissionCodesParams{TenantID: tenant.ID, RoleID: r.ID})
		require.NoError(t, err)
		require.Equal(t, permsBefore[r.Slug], sortedStrings(codes), "role %s permission set must not change on a second run", r.Slug)
	}
}

// TestEnsureTenantDefaults_NeverTouchesExisting proves the add-only
// contract: a custom (non-system) role, a renamed system role with a
// permission an admin revoked, a renamed duty type with a revoked
// permission, and a renamed library member type must all survive
// EnsureTenantDefaults byte-for-byte, even though the run also has real
// work to do creating everything else that is genuinely missing.
func TestEnsureTenantDefaults_NeverTouchesExisting(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	q := db.New(pg.AdminPool)

	tenant := createTenant(t, ctx, pg.AdminPool, "never-touches-"+uuid.NewString())
	seedSuperAdminOnly(t, ctx, pg.AdminPool, tenant.ID)

	// A custom role an admin created by hand -- not in RoleDefaults at all.
	customRole, err := q.CreateRole(ctx, db.CreateRoleParams{
		TenantID: tenant.ID, Slug: "finance_custom", Name: "Custom Finance Role", IsSystem: false,
	})
	require.NoError(t, err)
	require.NoError(t, q.AddRolePermission(ctx, db.AddRolePermissionParams{
		RoleID: customRole.ID, PermissionCode: authz.PermViewBilling, TenantID: tenant.ID,
	}))

	// The "principal" system role, pre-existing, renamed by an admin, and
	// missing a permission that is part of its default set (as if an
	// admin had revoked it).
	principalRole, err := q.CreateRole(ctx, db.CreateRoleParams{
		TenantID: tenant.ID, Slug: authz.RoleSlugPrincipal, Name: "Kepala Sekolah (Renamed)", IsSystem: true,
	})
	require.NoError(t, err)
	require.NoError(t, q.AddRolePermission(ctx, db.AddRolePermissionParams{
		RoleID: principalRole.ID, PermissionCode: authz.PermViewDashboard, TenantID: tenant.ID,
	}))

	// The "homeroom" duty type, pre-existing, renamed, and missing a
	// permission that is part of its default set.
	homeroomDuty, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{
		TenantID: tenant.ID, Slug: "homeroom", Name: "Wali Kelas (Renamed)", ScopeKind: "class",
	})
	require.NoError(t, err)
	require.NoError(t, q.AddDutyPermission(ctx, db.AddDutyPermissionParams{
		DutyTypeID: homeroomDuty.ID, PermissionCode: authz.PermViewAttendance, TenantID: tenant.ID,
	}))

	// The "student" library member type, pre-existing, renamed, with a
	// distinctive loan-limit value that would never come from the defaults.
	_, err = q.CreateMemberType(ctx, db.CreateMemberTypeParams{
		TenantID: tenant.ID, Name: "Siswa (Renamed)", MaxLoanItems: 99, MaxLoanDays: 99,
		RenewalDays: 99, MaxRenewals: 99, FineType: string(librarydomain.FineConstant),
		FinePerTenor: 500, TenorDays: 1, SuspendDays: 99, ValidityMonths: 99,
		DefaultForRole: database.Text("student"),
	})
	require.NoError(t, err)

	require.NoError(t, migrator.EnsureTenantDefaults(ctx, pg.AppPool, tenant.ID))

	// The custom role is untouched.
	roles, err := q.ListRolesByTenant(ctx, tenant.ID)
	require.NoError(t, err)
	custom := roleBySlug(t, roles, "finance_custom")
	require.Equal(t, "Custom Finance Role", custom.Name)
	require.False(t, custom.IsSystem)
	customCodes, err := q.ListRolePermissionCodes(ctx, db.ListRolePermissionCodesParams{TenantID: tenant.ID, RoleID: custom.ID})
	require.NoError(t, err)
	require.Equal(t, []string{authz.PermViewBilling}, customCodes)

	// The renamed principal role keeps its custom name and its revoked
	// permission stays revoked -- EnsureTenantDefaults never grants
	// permissions to a role that already existed.
	principal := roleBySlug(t, roles, authz.RoleSlugPrincipal)
	require.Equal(t, "Kepala Sekolah (Renamed)", principal.Name)
	principalCodes, err := q.ListRolePermissionCodes(ctx, db.ListRolePermissionCodesParams{TenantID: tenant.ID, RoleID: principal.ID})
	require.NoError(t, err)
	require.Equal(t, []string{authz.PermViewDashboard}, principalCodes)

	// The renamed homeroom duty type keeps its custom name and its revoked
	// permission stays revoked.
	duties, err := q.ListDutyTypes(ctx, db.ListDutyTypesParams{TenantID: tenant.ID, IncludeInactive: true})
	require.NoError(t, err)
	homeroom := dutyTypeBySlug(t, duties, "homeroom")
	require.Equal(t, "Wali Kelas (Renamed)", homeroom.Name)
	homeroomCodes, err := q.ListDutyPermissionCodes(ctx, db.ListDutyPermissionCodesParams{TenantID: tenant.ID, DutyTypeID: homeroom.ID})
	require.NoError(t, err)
	require.Equal(t, []string{authz.PermViewAttendance}, homeroomCodes)

	// The renamed student library member type keeps its custom name and
	// distinctive loan limits.
	memberTypes, err := q.ListMemberTypes(ctx, tenant.ID)
	require.NoError(t, err)
	student := memberTypeByRole(t, memberTypes, "student")
	require.Equal(t, "Siswa (Renamed)", student.Name)
	require.Equal(t, int32(99), student.MaxLoanItems)

	// Everything genuinely missing was still created: another system role,
	// another duty type, and the other library member type.
	_ = roleBySlug(t, roles, authz.RoleSlugTeacher)
	_ = dutyTypeBySlug(t, duties, "counselor")
	_ = memberTypeByRole(t, memberTypes, "teacher")
}

// TestPostUp_PreservesCustomizations exercises the full cmd/migrate
// pipeline (PostUp = EnsureTenantDefaults then the existing
// syncSystemRoleDefaults) against a tenant that already looks like a real,
// customised deployment: a custom role, and a system role ("teacher") an
// admin renamed, partly revoked, and partly extended beyond its defaults.
// It proves the two routines' documented, different contracts hold
// together: EnsureTenantDefaults never touches the already-existing
// "teacher" role (so its custom name and its extra, non-default grant
// survive), while syncSystemRoleDefaults keeps its own existing behaviour
// of additively re-granting every default permission on every run (so the
// admin's revoked-but-still-a-default permission comes back -- this is
// the documented, unchanged behaviour the task asked to keep, not a bug).
func TestPostUp_PreservesCustomizations(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	q := db.New(pg.AdminPool)

	tenant := createTenant(t, ctx, pg.AdminPool, "postup-preserves-"+uuid.NewString())
	seedSuperAdminOnly(t, ctx, pg.AdminPool, tenant.ID)

	// A custom role, unrelated to any default.
	customRole, err := q.CreateRole(ctx, db.CreateRoleParams{
		TenantID: tenant.ID, Slug: "finance_custom", Name: "Custom Finance Role", IsSystem: false,
	})
	require.NoError(t, err)
	require.NoError(t, q.AddRolePermission(ctx, db.AddRolePermissionParams{
		RoleID: customRole.ID, PermissionCode: authz.PermViewBilling, TenantID: tenant.ID,
	}))

	// The "teacher" system role, pre-existing (as if provisioned earlier
	// and since customised): renamed, missing manage_grades (a default the
	// admin revoked), and carrying manage_visitors (a grant beyond its
	// defaults).
	var teacherDefaults []string
	for _, rd := range authz.RoleDefaults() {
		if rd.Slug == authz.RoleSlugTeacher {
			teacherDefaults = rd.Permissions
		}
	}
	require.NotEmpty(t, teacherDefaults, "teacher must be in RoleDefaults")
	teacherRole, err := q.CreateRole(ctx, db.CreateRoleParams{
		TenantID: tenant.ID, Slug: authz.RoleSlugTeacher, Name: "Guru (Renamed)", IsSystem: true,
	})
	require.NoError(t, err)
	for _, code := range teacherDefaults {
		if code == authz.PermManageGrades {
			continue // simulate an admin revoking this one default permission.
		}
		require.NoError(t, q.AddRolePermission(ctx, db.AddRolePermissionParams{
			RoleID: teacherRole.ID, PermissionCode: code, TenantID: tenant.ID,
		}))
	}
	require.NoError(t, q.AddRolePermission(ctx, db.AddRolePermissionParams{
		RoleID: teacherRole.ID, PermissionCode: authz.PermManageVisitors, TenantID: tenant.ID,
	}))

	require.NoError(t, migrator.PostUp(ctx, pg.AdminPool))

	roles, err := q.ListRolesByTenant(ctx, tenant.ID)
	require.NoError(t, err)

	// The custom role is completely untouched.
	custom := roleBySlug(t, roles, "finance_custom")
	require.Equal(t, "Custom Finance Role", custom.Name)
	customCodes, err := q.ListRolePermissionCodes(ctx, db.ListRolePermissionCodesParams{TenantID: tenant.ID, RoleID: custom.ID})
	require.NoError(t, err)
	require.Equal(t, []string{authz.PermViewBilling}, customCodes)

	// The teacher role's custom name survives (EnsureTenantDefaults never
	// touched it, since it already existed); its revoked default
	// permission is restored (syncSystemRoleDefaults' existing additive
	// behaviour, unchanged); its extra, non-default grant is untouched
	// (nothing in this pipeline ever removes a permission).
	teacher := roleBySlug(t, roles, authz.RoleSlugTeacher)
	require.Equal(t, "Guru (Renamed)", teacher.Name)
	teacherCodes, err := q.ListRolePermissionCodes(ctx, db.ListRolePermissionCodesParams{TenantID: tenant.ID, RoleID: teacher.ID})
	require.NoError(t, err)
	require.Contains(t, teacherCodes, authz.PermManageGrades, "revoked default permission must be restored by syncSystemRoleDefaults")
	require.Contains(t, teacherCodes, authz.PermManageVisitors, "non-default grant must survive")
	require.Equal(t, sortedStrings(append(append([]string{}, teacherDefaults...), authz.PermManageVisitors)), sortedStrings(teacherCodes))

	// Roles genuinely missing (e.g. "staff") were still created by the
	// EnsureTenantDefaults half of PostUp.
	_ = roleBySlug(t, roles, authz.RoleSlugStaff)
}
