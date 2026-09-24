package authz

import "testing"

// TestAdminRoleDefaultExcludesPlatformSuperadmin proves the tenant's own
// "admin" system role never carries platform_superadmin, which gates the
// cross-tenant platform console (permissions_platform.go): a tenant admin
// must never reach it, only the platform operator role does.
func TestAdminRoleDefaultExcludesPlatformSuperadmin(t *testing.T) {
	for _, rd := range RoleDefaults() {
		if rd.Slug != RoleSlugAdmin {
			continue
		}
		for _, code := range rd.Permissions {
			if code == PermPlatformSuperadmin {
				t.Fatalf("admin role default must not include %q", PermPlatformSuperadmin)
			}
		}
		if code := PermManagePermissions; containsCode(rd.Permissions, code) {
			t.Fatalf("admin role default must not include %q", code)
		}
		return
	}
	t.Fatal("admin is not in RoleDefaults()")
}

// TestSuperAdminRoleDefaultKeepsPlatformSuperadmin proves the exclusion is
// scoped to admin only -- super_admin (the platform operator role) must
// still carry every permission, including platform_superadmin.
func TestSuperAdminRoleDefaultKeepsPlatformSuperadmin(t *testing.T) {
	for _, rd := range RoleDefaults() {
		if rd.Slug != RoleSlugSuperAdmin {
			continue
		}
		if !containsCode(rd.Permissions, PermPlatformSuperadmin) {
			t.Fatalf("super_admin role default must include %q", PermPlatformSuperadmin)
		}
		return
	}
	t.Fatal("super_admin is not in RoleDefaults()")
}

// TestPrincipalRoleDefault proves the "principal" (Kepala Sekolah) system
// role is an overseer, not an operator: it must never carry
// tenant/user/role administration or platform_superadmin, but it must
// carry the supervision permissions (the principal's core job) and the
// report/export permissions the product brief calls for.
func TestPrincipalRoleDefault(t *testing.T) {
	for _, rd := range RoleDefaults() {
		if rd.Slug != RoleSlugPrincipal {
			continue
		}
		for _, forbidden := range []string{
			PermManageSettings,
			PermManagePermissions,
			PermPlatformSuperadmin,
			PermManageMasterData,
			PermViewUsers,
			PermCreateUsers,
			PermEditUsers,
			PermDeleteUsers,
			PermImpersonateUsers,
			PermManageGrades,
			PermManageCounseling,
			PermVoidPayments,
			PermRecordPayments,
		} {
			if containsCode(rd.Permissions, forbidden) {
				t.Errorf("principal role default must not include %q", forbidden)
			}
		}
		for _, required := range []string{
			PermViewSupervision,
			PermManageSupervision,
			PermViewReports,
			PermManageReportSchedules,
			PermViewDiscipline,
			PermViewAcademicData,
			PermViewAuditLogs,
			PermPublishAnnouncements,
		} {
			if !containsCode(rd.Permissions, required) {
				t.Errorf("principal role default must include %q", required)
			}
		}
		return
	}
	t.Fatal("principal is not in RoleDefaults()")
}
