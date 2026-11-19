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
	"github.com/omanjaya/newsekolah/apps/api/migrations"
)

// TestSupervisionOwnPermission_TeacherReachesOwnHalfOnly proves the
// teacher's default (view_own_supervision + respond_to_supervision, never
// view_supervision) opens exactly the observed teacher's half of the
// supervision workflow through the real bundled spec: the cycles, the
// per-teacher report and its export, planned visits, an observation and
// the response -- every one of them scoped to the caller in the service --
// while the school-wide list and every observer action stay forbidden.
func TestSupervisionOwnPermission_TeacherReachesOwnHalfOnly(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	q := db.New(pg.AdminPool)

	doc, err := api.GetSpec()
	require.NoError(t, err)
	ops, err := authz.LoadOperationPermissions(doc)
	require.NoError(t, err)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "supervision-own-authz-" + uuid.NewString(), Name: "Supervision Own Authz Test",
		EducationLevel: "sma", Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	teacher := seedRoleAndUser(t, ctx, q, tenantRow.ID, authz.RoleSlugTeacher, "guru-supervision")
	principal := seedRoleAndUser(t, ctx, q, tenantRow.ID, authz.RoleSlugPrincipal, "kepsek-supervision")
	provider := rlsPermissionProvider{pool: pg.AppPool}

	set, err := provider.EffectivePermissions(ctx, tenantRow.ID, teacher.UserID)
	require.NoError(t, err)
	require.True(t, set.Has(authz.PermViewOwnSupervision))
	require.True(t, set.Has(authz.PermRespondSupervised))
	require.False(t, set.Has(authz.PermViewSupervision), "a teacher must never read every teacher's results")

	ownHalf := []string{
		"ListSupervisionCycles", "GetSupervisionCycle", "ListScheduledObservationsForTeacher",
		"GetObservation", "RespondToObservation", "GetTeacherSupervisionReport", "ExportTeacherSupervisionReport",
	}
	for _, operationID := range ownHalf {
		require.NoError(t, authz.Authorize(ctx, ops, provider, operationID, teacher),
			"teacher must be able to call %s", operationID)
	}
	for _, operationID := range []string{
		"ListScheduledObservations", "CreateSupervisionCycle", "UpdateSupervisionCycle",
		"ScheduleObservation", "CompleteObservation",
	} {
		require.Equal(t, httpx.ErrForbidden, authz.Authorize(ctx, ops, provider, operationID, teacher),
			"teacher must be forbidden from %s", operationID)
	}

	// The principal keeps reading through view_supervision, the other
	// alternative of the same operations.
	for _, operationID := range []string{
		"ListSupervisionCycles", "GetSupervisionCycle", "ListScheduledObservationsForTeacher",
		"GetObservation", "GetTeacherSupervisionReport", "ExportTeacherSupervisionReport", "ListScheduledObservations",
	} {
		require.NoError(t, authz.Authorize(ctx, ops, provider, operationID, principal),
			"principal must be able to call %s", operationID)
	}
}

// TestSupervisionOwnPermission_MigrationBackfillsExistingTeachers runs
// 0128_teacher_own_supervision.up.sql against a tenant whose teacher role
// predates it, and checks it grants exactly the two permissions to the
// system teacher role and leaves a tenant-customised role alone.
func TestSupervisionOwnPermission_MigrationBackfillsExistingTeachers(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	q := db.New(pg.AdminPool)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "supervision-own-migration-" + uuid.NewString(), Name: "Supervision Own Migration Test",
		EducationLevel: "sma", Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	teacherRole, err := q.CreateRole(ctx, db.CreateRoleParams{
		TenantID: tenantRow.ID, Slug: authz.RoleSlugTeacher, Name: "Guru", IsSystem: true,
	})
	require.NoError(t, err)
	customRole, err := q.CreateRole(ctx, db.CreateRoleParams{
		TenantID: tenantRow.ID, Slug: "guru_honorer", Name: "Guru honorer", IsSystem: false,
	})
	require.NoError(t, err)

	up, err := migrations.FS.ReadFile("0128_teacher_own_supervision.up.sql")
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx, string(up))
	require.NoError(t, err)
	// Idempotent: a second run changes nothing and does not fail.
	_, err = pg.AdminPool.Exec(ctx, string(up))
	require.NoError(t, err)

	granted := func(roleID uuid.UUID) []string {
		t.Helper()
		rows, err := pg.AdminPool.Query(ctx,
			`select permission_code from role_permissions where role_id = $1 order by permission_code`, roleID)
		require.NoError(t, err)
		defer rows.Close()
		var codes []string
		for rows.Next() {
			var code string
			require.NoError(t, rows.Scan(&code))
			codes = append(codes, code)
		}
		require.NoError(t, rows.Err())
		return codes
	}
	require.Equal(t, []string{authz.PermRespondSupervised, authz.PermViewOwnSupervision}, granted(teacherRole.ID))
	require.Empty(t, granted(customRole.ID))
}
