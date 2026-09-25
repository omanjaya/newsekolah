// Package authz is the single source of truth for the static permission catalog
// and for evaluating a user's effective permissions (role permissions union
// active duty permissions). Scope checks (which class, which student) happen
// in the service layer via Scope, not here.
package authz

// Permission is a stable, machine-readable permission code stored in the
// permissions table and referenced by role_permissions / duty_permissions.
type Permission struct {
	Code        string
	Group       string
	Description string
}

const (
	PermViewDashboard = "view_dashboard"

	PermViewAnnouncements   = "view_announcements"
	PermCreateAnnouncements = "create_announcements"
	PermEditAnnouncements   = "edit_announcements"
	PermDeleteAnnouncements = "delete_announcements"

	PermViewUsers   = "view_users"
	PermCreateUsers = "create_users"
	PermEditUsers   = "edit_users"
	PermDeleteUsers = "delete_users"

	PermViewRoles         = "view_roles"
	PermManagePermissions = "manage_permissions"
	PermManageSettings    = "manage_settings"
	PermManageMasterData  = "manage_master_data"

	PermViewSchedules   = "view_schedules"
	PermManageSchedules = "manage_schedules"

	PermViewAttendance    = "view_attendance"
	PermManageAttendance  = "manage_attendance"
	PermCorrectAttendance = "correct_attendance"

	PermSubmitLeaveRequests = "submit_leave_requests"
	PermReviewLeaveRequests = "review_leave_requests"
	PermIssueLeaveLetters   = "issue_leave_letters"
	PermScanExitPermits     = "scan_exit_permits"

	PermViewNotifications = "view_notifications"

	PermManageGrades  = "manage_grades"
	PermViewGrades    = "view_grades"
	PermViewOwnGrades = "view_own_grades"
	PermViewReports   = "view_reports"

	PermManageReportSchedules = "manage_report_schedules"

	PermViewLibrary              = "view_library"
	PermManageLibraryCatalog     = "manage_library_catalog"
	PermManageLibraryCirculation = "manage_library_circulation"
	PermManageLibraryMembers     = "manage_library_members"
	PermManageLibrarySettings    = "manage_library_settings"
	PermViewLibraryReports       = "view_library_reports"
	PermViewOwnLibraryLoans      = "view_own_library_loans"

	PermViewChildAttendance = "view_child_attendance"
	PermViewChildGrades     = "view_child_grades"
)

// Catalog is the ordered, static list of every permission in the system.
// cmd/migrate upserts this into the permissions table on every run so the
// database catalog never drifts from the code that enforces it.
var Catalog = []Permission{
	{PermViewDashboard, "general", "View the dashboard landing page"},

	{PermViewAnnouncements, "announcements", "View announcements"},
	{PermCreateAnnouncements, "announcements", "Create announcements"},
	{PermEditAnnouncements, "announcements", "Edit announcements"},
	{PermDeleteAnnouncements, "announcements", "Delete announcements"},

	{PermViewUsers, "users", "View user accounts"},
	{PermCreateUsers, "users", "Create user accounts"},
	{PermEditUsers, "users", "Edit user accounts"},
	{PermDeleteUsers, "users", "Archive user accounts"},

	{PermViewRoles, "access", "View roles and permission catalog"},
	{PermManagePermissions, "access", "Create roles and assign permissions"},
	{PermManageSettings, "access", "Change tenant settings and branding"},
	{PermManageMasterData, "access", "Manage academic master data (subjects, rooms, classes, periods)"},

	{PermViewSchedules, "scheduling", "View teaching schedules"},
	{PermManageSchedules, "scheduling", "Create and edit teaching schedules"},

	{PermViewAttendance, "attendance", "View attendance records"},
	{PermManageAttendance, "attendance", "Record attendance"},
	{PermCorrectAttendance, "attendance", "Correct submitted attendance entries"},

	{PermSubmitLeaveRequests, "permits", "Submit a leave request"},
	{PermReviewLeaveRequests, "permits", "Review a leave request (homeroom duty)"},
	{PermIssueLeaveLetters, "permits", "Issue a leave letter (counselor duty)"},
	{PermScanExitPermits, "permits", "Scan exit permit gate tokens (security duty)"},

	{PermViewNotifications, "notifications", "View notifications"},

	{PermManageGrades, "grading", "Enter and edit grades"},
	{PermViewGrades, "grading", "View grades, gradebooks, recap and export reports (read-only)"},
	{PermViewOwnGrades, "grading", "View own grades (student)"},
	{PermViewReports, "reporting", "View cross-module reports"},
	{PermManageReportSchedules, "reporting", "Configure recurring report exports and their recipients"},

	{PermViewLibrary, "library", "Browse the library catalog"},
	{PermManageLibraryCatalog, "library", "Manage bibliographies and items"},
	{PermManageLibraryCirculation, "library", "Manage loans, returns, and renewals"},
	{PermManageLibraryMembers, "library", "Manage library members"},
	{PermManageLibrarySettings, "library", "Manage library loan rules and settings"},
	{PermViewLibraryReports, "library", "View library reports"},
	{PermViewOwnLibraryLoans, "library", "View own library loans, reservations, and fines"},

	{PermViewChildAttendance, "parent", "View a linked child's attendance"},
	{PermViewChildGrades, "parent", "View a linked child's grades"},
}

// Codes returns every permission code in Catalog, in declaration order.
func Codes() []string {
	codes := make([]string, len(Catalog))
	for i, p := range Catalog {
		codes[i] = p.Code
	}
	return codes
}

// Set builds a lookup set of effective permission codes from role and duty
// permissions. Duplicate codes (a permission granted by both a role and an
// active duty) collapse naturally since Set is backed by a map.
type Set map[string]struct{}

func NewSet(codes ...string) Set {
	s := make(Set, len(codes))
	for _, c := range codes {
		s[c] = struct{}{}
	}
	return s
}

func (s Set) Has(code string) bool {
	_, ok := s[code]
	return ok
}

func (s Set) Add(codes ...string) {
	for _, c := range codes {
		s[c] = struct{}{}
	}
}

func (s Set) Slice() []string {
	out := make([]string, 0, len(s))
	for c := range s {
		out = append(out, c)
	}
	return out
}
