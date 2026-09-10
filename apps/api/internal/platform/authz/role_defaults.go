package authz

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
		{"super_admin", "Super Admin", all},
		{"admin", "Admin Sekolah", without(all, PermManagePermissions)},
		{"teacher", "Guru", []string{
			PermViewDashboard, PermViewAnnouncements, PermViewSchedules, PermViewAcademicData,
			PermViewAttendance, PermManageAttendance, PermViewNotifications,
			PermManageGrades, PermViewLibrary, PermIssueScanTokens,
			PermCreateAnnouncements, PermEditAnnouncements, PermPublishAnnouncements,
			PermViewDiscipline, PermRecordViolations, PermViewEarlyWarning,
		}},
		{"staff", "Pegawai", []string{
			PermViewDashboard, PermViewAnnouncements, PermViewNotifications, PermViewLibrary, PermViewAcademicData, PermIssueScanTokens,
			PermCreateAnnouncements, PermEditAnnouncements, PermPublishAnnouncements,
			PermViewDiscipline, PermRecordViolations, PermViewEarlyWarning,
			PermViewVisitors, PermManageVisitors, PermViewVisitorIncidents, PermManageVisitorIncidents, PermViewVisitorReports,
		}},
		{"student", "Siswa", []string{
			PermViewDashboard, PermViewAnnouncements, PermViewNotifications, PermViewSchedules, PermViewAcademicData,
			PermViewOwnGrades, PermSubmitLeaveRequests, PermViewAttendance, PermViewLibrary,
		}},
		{"parent", "Orang Tua", []string{
			PermViewDashboard, PermViewAnnouncements, PermViewNotifications,
			PermViewChildAttendance, PermViewChildGrades, PermApproveChildLeaveRequests,
		}},
		{"librarian", "Pustakawan", []string{
			PermViewDashboard, PermViewNotifications, PermViewLibrary,
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
