package authz

// System role slugs, seeded for every tenant. Modules that need to look up
// a system role (e.g. the Dapodik import assigning the student role) should
// reference these constants rather than hardcoding the slug string.
const (
	RoleSlugSuperAdmin = "super_admin"
	RoleSlugAdmin      = "admin"
	RoleSlugTeacher    = "teacher"
	RoleSlugStaff      = "staff"
	RoleSlugStudent    = "student"
	RoleSlugParent     = "parent"
	RoleSlugLibrarian  = "librarian"
)

// RoleDefault is the default permission set for one system role. Seeding a
// new tenant creates these roles; cmd/migrate re-applies them additively so a
// permission introduced by a newer module reaches existing tenants without
// touching what an admin already customised.
type RoleDefault struct {
	Slug        string
	Name        string
	Permissions []string
}

// RoleDefaults returns the system roles and their default permissions. It is
// a function, not a var, because Catalog is assembled by init() across files.
func RoleDefaults() []RoleDefault {
	all := Codes()
	return []RoleDefault{
		{RoleSlugSuperAdmin, "Super Admin", all},
		// PermPlatformSuperadmin gates the cross-tenant platform console
		// (see permissions_platform.go): a tenant's own admin role must
		// never carry it, so it is excluded here alongside
		// PermManagePermissions.
		{RoleSlugAdmin, "Admin Sekolah", without(without(all, PermManagePermissions), PermPlatformSuperadmin)},
		{RoleSlugTeacher, "Guru", []string{
			PermViewDashboard, PermViewAnnouncements, PermViewSchedules, PermViewAcademicData,
			PermViewAttendance, PermManageAttendance, PermViewNotifications,
			PermManageGrades, PermViewLibrary, PermViewOwnLibraryLoans, PermIssueScanTokens,
			PermCreateAnnouncements, PermEditAnnouncements, PermPublishAnnouncements,
			PermViewDiscipline, PermRecordViolations, PermViewEarlyWarning,
		}},
		{RoleSlugStaff, "Pegawai", []string{
			PermViewDashboard, PermViewAnnouncements, PermViewNotifications, PermViewLibrary, PermViewOwnLibraryLoans, PermViewAcademicData, PermIssueScanTokens,
			PermCreateAnnouncements, PermEditAnnouncements, PermPublishAnnouncements,
			PermViewDiscipline, PermRecordViolations, PermViewEarlyWarning,
			PermViewVisitors, PermManageVisitors, PermViewVisitorIncidents, PermManageVisitorIncidents, PermViewVisitorReports,
			PermViewBilling, PermRecordPayments,
		}},
		{RoleSlugStudent, "Siswa", []string{
			PermViewDashboard, PermViewAnnouncements, PermViewNotifications, PermViewSchedules, PermViewAcademicData,
			PermViewOwnGrades, PermSubmitLeaveRequests, PermViewAttendance, PermViewOwnLibraryLoans,
		}},
		{RoleSlugParent, "Orang Tua", []string{
			PermViewDashboard, PermViewAnnouncements, PermViewNotifications,
			PermViewChildAttendance, PermViewChildGrades, PermApproveChildLeaveRequests, PermViewChildBilling, PermViewOwnLibraryLoans,
		}},
		{RoleSlugLibrarian, "Pustakawan", []string{
			PermViewDashboard, PermViewNotifications, PermViewLibrary, PermViewOwnLibraryLoans,
			PermManageLibraryCatalog, PermManageLibraryCirculation,
			PermManageLibraryMembers, PermManageLibrarySettings, PermViewLibraryReports,
		}},
	}
}

func without(codes []string, drop string) []string {
	out := make([]string, 0, len(codes))
	for _, c := range codes {
		if c != drop {
			out = append(out, c)
		}
	}
	return out
}
