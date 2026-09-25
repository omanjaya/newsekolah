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
			PermViewGrades,
		} {
			if !containsCode(rd.Permissions, required) {
				t.Errorf("principal role default must include %q", required)
			}
		}
		return
	}
	t.Fatal("principal is not in RoleDefaults()")
}

// TestTeacherRoleDefaultIncludesViewGrades proves manage_grades implies
// view_grades: a teacher who can edit grades must also be able to just
// read them (the read-only split, e.g. the gradebook/e-Rapor endpoints
// switched from manage_grades to view_grades in openapi/modules/
// grading.yaml), so introducing view_grades never removes read access
// from a role that already had it through manage_grades.
func TestTeacherRoleDefaultIncludesViewGrades(t *testing.T) {
	for _, rd := range RoleDefaults() {
		if rd.Slug != RoleSlugTeacher {
			continue
		}
		if !containsCode(rd.Permissions, PermManageGrades) {
			t.Fatal("teacher role default must include manage_grades (test assumption broke)")
		}
		if !containsCode(rd.Permissions, PermViewGrades) {
			t.Fatal("teacher role default must include view_grades alongside manage_grades")
		}
		return
	}
	t.Fatal("teacher is not in RoleDefaults()")
}

// TestLibrarianRoleDefaultIncludesViewAcademicData proves the librarian
// system role carries view_academic_data (added 25 September 2026, see
// role_defaults.go's comment on RoleSlugLibrarian): the narrowest
// permission GET /v1/academic/classes requires, so the bulk member
// registration dialog's class filter works for a librarian without
// granting them anything broader (e.g. manage_master_data).
func TestLibrarianRoleDefaultIncludesViewAcademicData(t *testing.T) {
	for _, rd := range RoleDefaults() {
		if rd.Slug != RoleSlugLibrarian {
			continue
		}
		if !containsCode(rd.Permissions, PermViewAcademicData) {
			t.Fatal("librarian role default must include view_academic_data")
		}
		if containsCode(rd.Permissions, PermManageMasterData) {
			t.Fatal("librarian role default must not include manage_master_data")
		}
		return
	}
	t.Fatal("librarian is not in RoleDefaults()")
}

// TestEveryRoleHoldingManageGradesAlsoHoldsViewGrades generalises the
// teacher-specific check above across every system role RoleDefaults()
// returns, so a future role gaining manage_grades cannot forget the
// read-only counterpart.
func TestEveryRoleHoldingManageGradesAlsoHoldsViewGrades(t *testing.T) {
	for _, rd := range RoleDefaults() {
		if !containsCode(rd.Permissions, PermManageGrades) {
			continue
		}
		if !containsCode(rd.Permissions, PermViewGrades) {
			t.Errorf("role %q holds manage_grades but not view_grades", rd.Slug)
		}
	}
}
