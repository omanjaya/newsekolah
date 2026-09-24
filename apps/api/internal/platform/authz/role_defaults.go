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
	RoleSlugPrincipal  = "principal"
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
		// RoleSlugPrincipal ("Kepala Sekolah"): an overseer role, not an
		// operator. It gets essentially every view_* permission in Catalog
		// (see everything the school runs), the report/export permissions,
		// and the two permissions that are the principal's own job rather
		// than delegated oversight of someone else's (publishing
		// announcements, running teacher supervision). It never gets a
		// manage_* permission that edits day-to-day records, and never
		// tenant/user/role administration -- see the comments below for the
		// specific, non-obvious calls.
		{RoleSlugPrincipal, "Kepala Sekolah", []string{
			PermViewDashboard,

			// Announcements: view like everyone, but the principal's own
			// action is approving and publishing -- not drafting. publish_
			// announcements (openapi/modules/announcements.yaml) is already
			// its own permission, separate from create_/edit_announcements,
			// specifically so an approver role does not also need drafting
			// rights; excluded create_/edit_/delete_announcements
			// deliberately, staff/teachers already draft.
			PermViewAnnouncements, PermPublishAnnouncements,

			// Audit: explicitly requested ("audit logs") without the rest of
			// identity-admin. view_roles/view_users are deliberately excluded
			// (see the exclusion note at the end): they are the "user
			// management" admin screen, not oversight of school operations.
			PermViewAuditLogs,

			// Schedules and journals: view_journals_all
			// (permissions_scheduling.go) is exactly "read every class
			// journal for the year", the scheduling module's supervisor
			// permission -- not manage_schedules, which edits the timetable.
			PermViewSchedules, PermViewJournalsAll,

			PermViewAttendance,      // not manage_/correct_attendance (recording is a teacher/piket job)
			PermViewStaffAttendance, // not manage_/correct_/manage_..._schedules (HR/piket operations)
			PermViewNotifications,

			// Reporting: "all report/export permissions" per the product
			// brief. view_reports also gates the reports catalogue's
			// attendance.daily, permits.leave_requests and
			// permits.exit_permits_yearly kinds (reports/service/service.go
			// Catalog()) -- this is how the principal sees permits data:
			// the aggregate report, not the live approval queue (see the
			// permits note below). manage_report_schedules lets the
			// principal configure a recurring export to their own inbox.
			PermViewReports, PermManageReportSchedules,

			PermViewLibrary, PermViewLibraryReports,
			// view_own_library_loans is the personal "I borrowed a book"
			// permission every non-librarian role already carries (teacher,
			// staff, student, parent); included for the same reason, not as
			// an oversight permission.
			PermViewOwnLibraryLoans,

			PermViewAcademicData, // class rosters ("students"), calendar, structure -- not manage_* (master data edits)
			PermViewActivities,
			PermViewEarlyWarning, // not manage_early_warning_rules (tuning thresholds is configuration, not oversight)
			PermViewBilling,      // billing reports only -- never generate_bills/record_payments/void_payments

			// Discipline: view_discipline covers violation records and
			// warning letters (all read endpoints in
			// openapi/modules/discipline.yaml use only this permission) --
			// visible, not confidential. manage_counseling is deliberately
			// EXCLUDED: it is the single permission gating every
			// counseling-note route, list/read AND create/update/delete
			// alike (discipline.yaml lines ~596-836). docs/08-security.md
			// section 5 says a principal may read a counseling note "bila
			// diaktifkan" (when its visibility is set to "leadership") --
			// GetCounseling/ListCounselingsForStudent already enforce that
			// visibility server-side (service/counseling.go's VisibleTo) --
			// but granting manage_counseling would also let the principal
			// call CreateCounseling and author a note as if they were the
			// assigned counselor, which is reserved to the counselor alone.
			// The catalog has no separate read-only counseling permission
			// to grant instead, so the principal cannot open individual
			// counseling notes through the API today; this is a known gap,
			// not a decision to leave counseling opaque to leadership (see
			// the report for the suggested follow-up: split
			// manage_counseling into view_counseling/manage_counseling).
			PermViewDiscipline,

			// Mentoring (guru wali): view_mentoring covers group rosters and
			// the student snapshot, not meeting notes. manage_mentoring is
			// excluded for the identical reason manage_counseling is: it is
			// one permission for both reading and authoring a mentor's
			// notes (its own summary/response already visible to
			// "leadership" server-side, mentoring.yaml lines 209-254), and
			// create/update/delete ride along it with no separate
			// read-only split available.
			PermViewMentoring,

			// Supervision: the principal's core job (task brief). Both
			// halves, unlike counseling/mentoring: nothing here is another
			// role's confidential note -- an observation is the principal's
			// own write, not something reserved to someone else.
			PermViewSupervision, PermManageSupervision,

			PermViewVisitors, PermViewVisitorIncidents, PermViewVisitorReports, // not manage_visitors/manage_visitor_incidents (gate/front-desk operations)
		}},
		// Deliberately excluded from every entry above, as a group:
		//   - manage_settings, manage_permissions, manage_master_data,
		//     platform_superadmin: explicit product exclusions.
		//   - view_users, view_roles, create_/edit_/delete_users,
		//     impersonate_users: the identity-admin "user management" screen
		//     -- also an explicit exclusion. The principal still sees staff
		//     through view_staff_attendance, view_academic_data (teaching
		//     assignments/rosters) and view_journals_all, just not the raw
		//     account-management screen.
		//   - manage_grades / view_own_grades: no read-only "view grades"
		//     permission exists in the catalog (openapi/modules/grading.yaml
		//     gates the gradebook, the class-subject report and the
		//     reports-catalogue KindGradingReport all behind manage_grades,
		//     which also edits every score); granting it to see grades would
		//     also grant editing them, which the product brief explicitly
		//     excludes. Same class of gap as counseling/mentoring above --
		//     flagged in the report as missing a view_grades split.
		//   - review_leave_requests, issue_leave_letters,
		//     approve_child_leave_requests, submit_leave_requests,
		//     issue_scan_tokens, scan_exit_permits, manage_workflows: every
		//     permits action permission is tied to one specific actor in the
		//     workflow (submitter, homeroom/counselor duty reviewer, gate
		//     duty, guardian) -- none of them mean "principal oversight".
		//     "Approving at the leadership stage" (the product brief's
		//     phrasing) is gated purely by holding the "leadership" duty
		//     (service-layer HasActiveDuty check on an "authenticated"-only
		//     operation, e.g. scanExitPermitStage, reviewLateArrival's next
		//     stage), not by any permission -- there is nothing to add here
		//     for it; a school that wants its principal to approve at that
		//     stage assigns them the existing "leadership" duty
		//     (duty_defaults.go), independently of this role.
		//   - issue_warning_letters, record_violations,
		//     manage_discipline_catalog: "the counselor's issuing screen"
		//     and recording, not oversight (view_discipline already covers
		//     reading every issued letter and record).
		//   - view_monitor_presence, view_integrations,
		//     manage_notification_settings, manage_whatsapp,
		//     manage_early_warning_rules: internal ops/config tooling the
		//     product brief's "sees everything a school runs on" list does
		//     not name.
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
