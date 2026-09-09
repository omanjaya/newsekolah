package authz

// Academic module permission codes. Declared in a separate file (per the
// academic module's ownership notes) and appended to Catalog in init(),
// rather than edited into permissions.go, so parallel module work never
// conflicts on that file.
const (
	PermViewAcademicData          = "view_academic_data"
	PermManageAcademicYears       = "manage_academic_years"
	PermManageEnrollments         = "manage_enrollments"
	PermManageTeachingAssignments = "manage_teaching_assignments"
)

func init() {
	Catalog = append(Catalog,
		Permission{PermViewAcademicData, "academic", "View academic years, classes, subjects, periods, and related structure"},
		Permission{PermManageAcademicYears, "academic", "Create, update, activate, and archive academic years, terms, and the school calendar"},
		Permission{PermManageEnrollments, "academic", "Assign, move, bulk-import, and promote student enrollments"},
		Permission{PermManageTeachingAssignments, "academic", "Assign teachers to teach a subject in a class"},
	)
}
