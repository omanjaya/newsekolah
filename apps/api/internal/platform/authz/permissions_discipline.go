package authz

const (
	PermViewDiscipline          = "view_discipline"
	PermRecordViolations        = "record_violations"
	PermManageDisciplineCatalog = "manage_discipline_catalog"
	PermIssueWarningLetters     = "issue_warning_letters"
	PermManageCounseling        = "manage_counseling"
)

func init() {
	Catalog = append(Catalog,
		Permission{PermViewDiscipline, "discipline", "See violation records, points and warning letters"},
		Permission{PermRecordViolations, "discipline", "Record or void a student's violation"},
		Permission{PermManageDisciplineCatalog, "discipline", "Edit the violation catalog and point values"},
		Permission{PermIssueWarningLetters, "discipline", "Issue numbered warning letters"},
		Permission{PermManageCounseling, "discipline", "Write and read counseling notes"},
	)
}
