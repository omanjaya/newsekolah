// Package domain: bulk user import. ImportRow is the parsed, one-per-row
// shape of the XLSX template columns (docs/analysis/backend-inventory.md
// section 1.5 lists the old 33-column template; columns here are adapted
// to the new users/user_profiles/student_profiles/teacher_profiles/
// staff_profiles split). Validation here is pure and DB-free; uniqueness
// checks (username/email/NIS/NIP already taken) happen in the service,
// which alone has repository access.
package domain

// ImportAction is what the service decided a row should do, after matching
// it against existing users by username/NIS/NIP.
type ImportAction string

const (
	ImportActionCreate ImportAction = "create"
	ImportActionUpdate ImportAction = "update"
)

// ImportRow is one parsed spreadsheet row, before it is matched against the
// database or turned into a create/update command.
type ImportRow struct {
	RowNumber int

	Username string
	Email    string
	Password string

	ProfileKind ProfileKind
	RoleSlug    string

	NIK        string
	Name       string
	Gender     string
	BirthPlace string
	BirthDate  string
	Religion   string
	Address    string
	District   string
	City       string
	Phone      string
	BloodType  string

	// Student
	NIS              string
	NISN             string
	EntryYear        string
	FatherName       string
	MotherName       string
	GuardianName     string
	GuardianPhone    string
	ParentOccupation string
	PreviousSchool   string

	// Teacher / staff
	NIP              string
	NUPTK            string
	LastEducation    string
	EmploymentStatus string
	JoinedYear       string
	Specialization   string
	EmployeeNumber   string
	Position         string
}

// ImportRowResult is what the preview and commit endpoints report back for
// one row.
type ImportRowResult struct {
	RowNumber int
	Action    ImportAction
	Errors    []string
}

// ValidateImportRow checks the fields of one row that do not require a
// database lookup: required fields, length limits, and which profile
// fields are mandatory for which kind. isUpdate is true when the service
// already matched this row to an existing user by username/NIS/NIP, which
// makes Password optional (an update never resets a password by itself --
// use the admin reset-password action for that).
func ValidateImportRow(row ImportRow, isUpdate bool) []string {
	var errs []string

	if row.Name == "" {
		errs = append(errs, "name is required")
	} else if len(row.Name) > 150 {
		errs = append(errs, "name must be at most 150 characters")
	}

	if !row.ProfileKind.Valid() {
		errs = append(errs, "profile_kind must be one of student, teacher, staff, parent")
	}
	if row.RoleSlug == "" {
		errs = append(errs, "role_slug is required")
	}

	if !isUpdate && row.Password != "" {
		if err := ValidatePasswordPolicy(row.Password); err != nil {
			errs = append(errs, err.Error())
		}
	}

	if row.Gender != "" && row.Gender != "male" && row.Gender != "female" {
		errs = append(errs, "gender must be male or female")
	}

	errs = append(errs, validateProfileFields(row)...)
	return errs
}

func validateProfileFields(row ImportRow) []string {
	var errs []string
	switch row.ProfileKind {
	case ProfileStudent:
		if row.NIS == "" {
			errs = append(errs, "nis is required for student profiles")
		}
	case ProfileTeacher:
		if row.NIP == "" {
			errs = append(errs, "nip is required for teacher profiles")
		}
	case ProfileStaff:
		if row.EmployeeNumber == "" {
			errs = append(errs, "employee_number is required for staff profiles")
		}
	}
	return errs
}
