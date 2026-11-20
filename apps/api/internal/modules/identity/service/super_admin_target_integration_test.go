package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

// A school admin can grant every role but super_admin, and must not be
// able to take one away or borrow it either: editing the platform's
// Super Admin (which replaces its roles), archiving or restoring it, and
// resetting its password (a set-password token is its access) are all
// refused unless the actor is a super admin too.
func TestOnlyASuperAdminChangesASuperAdminAccount(t *testing.T) {
	pg, svc, _ := setupIdentityTest(t)
	ctx := context.Background()
	pool := pg.AdminPool
	tenantID := insertTestTenant(t, pool, "super-admin-target")
	superRole := insertTestRole(t, pool, tenantID, domain.SuperAdminRoleSlug, "Super Admin")
	adminRole := insertTestRole(t, pool, tenantID, "admin", "Admin Sekolah")
	grant := func(userID, roleID uuid.UUID) { assignPrimaryRole(t, pool, tenantID, userID, roleID) }
	operator := insertTestUser(t, pool, tenantID, "operator")
	grant(operator, superRole)
	schoolAdmin := insertTestUser(t, pool, tenantID, "admin")
	grant(schoolAdmin, adminRole)
	otherSuper := insertTestUser(t, pool, tenantID, "operator2")
	grant(otherSuper, superRole)

	edit := service.UserWriteInput{
		Name: "Operator Diambil Alih", ProfileKind: domain.ProfileStaff, Locale: "id",
		Roles: []domain.RoleGrant{{RoleID: adminRole, IsPrimary: true}},
	}
	slugs := func(userID uuid.UUID) []string {
		t.Helper()
		rows, err := pool.Query(ctx, `select r.slug from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1`, userID)
		require.NoError(t, err)
		defer rows.Close()
		var out []string
		for rows.Next() {
			var slug string
			require.NoError(t, rows.Scan(&slug))
			out = append(out, slug)
		}
		return out
	}

	_, err := svc.UpdateUser(ctx, tenantID, schoolAdmin, operator, edit)
	require.ErrorIs(t, err, domain.ErrSuperAdminTargetForbidden)
	require.Equal(t, []string{domain.SuperAdminRoleSlug}, slugs(operator), "the refused edit keeps the super admin role")

	_, err = svc.ResetPasswordByAdmin(ctx, tenantID, schoolAdmin, operator)
	require.ErrorIs(t, err, domain.ErrSuperAdminTargetForbidden)
	var resets int
	require.NoError(t, pool.QueryRow(ctx, `select count(*) from password_resets where user_id = $1`, operator).Scan(&resets))
	require.Zero(t, resets, "no set-password token is issued")

	require.ErrorIs(t, svc.ArchiveUser(ctx, tenantID, schoolAdmin, operator), domain.ErrSuperAdminTargetForbidden)
	require.ErrorIs(t, svc.RestoreUser(ctx, tenantID, schoolAdmin, operator), domain.ErrSuperAdminTargetForbidden)
	var status string
	require.NoError(t, pool.QueryRow(ctx, `select status from users where id = $1`, operator).Scan(&status))
	require.Equal(t, "active", status)

	// Another super admin can still manage the account, and a school admin
	// keeps managing ordinary accounts.
	_, err = svc.ResetPasswordByAdmin(ctx, tenantID, otherSuper, operator)
	require.NoError(t, err)
	require.NoError(t, svc.ArchiveUser(ctx, tenantID, otherSuper, operator))
	require.NoError(t, svc.RestoreUser(ctx, tenantID, otherSuper, operator))
	_, err = svc.ResetPasswordByAdmin(ctx, tenantID, schoolAdmin, otherSuper)
	require.ErrorIs(t, err, domain.ErrSuperAdminTargetForbidden)
	staff := insertTestUser(t, pool, tenantID, "pegawai")
	grant(staff, adminRole)
	_, err = svc.ResetPasswordByAdmin(ctx, tenantID, schoolAdmin, staff)
	require.NoError(t, err)
}
