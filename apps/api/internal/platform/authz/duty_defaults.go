package authz

// DutyTypeDefault is one of the standard duty types a tenant is seeded
// with: homeroom, counseling, leadership, security, and the "duty
// teacher" (Guru Piket) rotation. cmd/seed used to keep this list to
// itself; it now lives here so a real tenant's bootstrap (not just the
// local demo tenant) creates the same duty types with the same default
// permissions, per docs/06-database-schema.md section 3.
type DutyTypeDefault struct {
	Slug        string
	Name        string
	ScopeKind   string
	Permissions []string
}

// DutyTypeDefaults returns the system duty types and their default
// permissions. Like RoleDefaults, it is a function (not a var) because the
// permission catalog it draws from is assembled by init() across files.
func DutyTypeDefaults() []DutyTypeDefault {
	return []DutyTypeDefault{
		{"homeroom", "Wali Kelas", "class", []string{PermViewAttendance, PermReviewLeaveRequests, PermCorrectAttendance}},
		{"counselor", "Guru BK", "school", []string{PermIssueLeaveLetters, PermViewReports, PermManageCounseling, PermIssueWarningLetters, PermViewDiscipline, PermRecordViolations}},
		{"picket", "Guru Piket", "school", []string{PermManageAttendance}},
		// issue_scan_tokens: the leadership stage of a late arrival or an
		// exit permit is approved by showing the student a stage QR, so
		// whoever holds this duty must be able to mint it -- including a
		// principal, whose role leaves that permission out on purpose
		// (role_defaults.go).
		{"leadership", "Wakil Kepala Sekolah", "school", []string{PermReviewLeaveRequests, PermIssueLeaveLetters, PermViewReports, PermIssueWarningLetters, PermViewDiscipline, PermIssueScanTokens}},
		{"security", "Satpam", "school", []string{PermScanExitPermits}},
		{"librarian", "Petugas Perpustakaan", "school", []string{PermManageLibraryCirculation}},
	}
}
