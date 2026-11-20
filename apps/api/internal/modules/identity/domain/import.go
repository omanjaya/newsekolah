// Package domain: bulk user import. ImportRow is the parsed, one-per-row
// shape of the XLSX template columns (docs/analysis/backend-inventory.md
// section 1.5 lists the old 33-column template; columns here are adapted
// to the new users/user_profiles/student_profiles/teacher_profiles/
// staff_profiles split). Validation here is pure and DB-free; uniqueness
// checks (username/email/NIS/NIP already taken) happen in the service,
// which alone has repository access.
package domain

import (
	"errors"
	"strconv"
	"strings"
	"time"
)

// MaxImportRows caps one bulk import request, matching the old app's
// limit (reference/sion-rebuild-go user_import.go).
const MaxImportRows = 5000

// ImportBirthDateLayout is the date format an import row's birth_date
// column must use.
const ImportBirthDateLayout = "2006-01-02"

// ImportMode is the batch-level choice between only ever creating new
// users (the historical behaviour) or matching a row against an existing
// user first. Carried on the request, not per row: every row in one batch
// is evaluated the same way.
type ImportMode string

const (
	ImportModeCreate ImportMode = "create"
	ImportModeUpsert ImportMode = "upsert"
)

// ImportAction is what the service decided a row should do, after matching
// it against an existing user by username (the only key the reference app
// matched on; see docs/15-paritas-sion.md).
type ImportAction string

const (
	ImportActionCreate    ImportAction = "create"
	ImportActionUpdate    ImportAction = "update"
	ImportActionUnchanged ImportAction = "unchanged"
	ImportActionError     ImportAction = "error"
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

// ValidateImportRow checks the fields of one row that do not require a
// database lookup: required fields, length limits, and which profile
// fields are mandatory for which kind. isUpdate is true when the service
// already matched this row to an existing user by username/NIS/NIP, which
// makes Password optional (an update never resets a password by itself --
// use the admin reset-password action for that). Each problem comes back
// as a coded ImportRowError, never a prose sentence, so the client can
// show it in the admin's language.
func ValidateImportRow(row ImportRow, isUpdate bool) []ImportRowError {
	var errs []ImportRowError

	if row.Name == "" {
		errs = append(errs, importRowError(ImportErrNameRequired, "name"))
	} else if len(row.Name) > maxImportNameLength {
		errs = append(errs, importRowError(ImportErrNameTooLong, "name", "max", strconv.Itoa(maxImportNameLength)))
	}

	if !row.ProfileKind.Valid() {
		errs = append(errs, importRowError(ImportErrProfileKindInvalid, "profile_kind"))
	}
	if row.RoleSlug == "" {
		errs = append(errs, importRowError(ImportErrRoleRequired, "role_slug"))
	}

	if !isUpdate && row.Password != "" {
		if e, ok := passwordPolicyRowError(row.Password); ok {
			errs = append(errs, e)
		}
	}

	if row.Gender != "" {
		if _, ok := NormalizeGender(row.Gender); !ok {
			errs = append(errs, importRowError(ImportErrGenderInvalid, "gender"))
		}
	}

	if row.BloodType != "" && !ValidateBloodType(row.BloodType) {
		errs = append(errs, importRowError(ImportErrBloodTypeInvalid, "blood_type"))
	}

	if row.BirthDate != "" {
		if _, err := time.Parse(ImportBirthDateLayout, row.BirthDate); err != nil {
			errs = append(errs, importRowError(ImportErrBirthDateFormat, "birth_date"))
		}
	}

	errs = append(errs, validateProfileFields(row)...)
	return errs
}

// maxImportNameLength matches users.name's length check.
const maxImportNameLength = 150

// passwordPolicyRowError turns a ValidatePasswordPolicy failure into the
// matching coded row error.
func passwordPolicyRowError(password string) (ImportRowError, bool) {
	switch err := ValidatePasswordPolicy(password); {
	case err == nil:
		return ImportRowError{}, false
	case errors.Is(err, ErrPasswordTooShort):
		return importRowError(ImportErrPasswordTooShort, "password", "min", strconv.Itoa(minPasswordLength)), true
	case errors.Is(err, ErrPasswordTooLong):
		return importRowError(ImportErrPasswordTooLong, "password", "max", strconv.Itoa(maxPasswordLength)), true
	default:
		return importRowError(ImportErrPasswordInvalid, "password"), true
	}
}

// PasswordPolicyRowError is passwordPolicyRowError for the service, which
// re-checks an explicit password when hashing it.
func PasswordPolicyRowError(password string) (ImportRowError, bool) {
	return passwordPolicyRowError(password)
}

// NormalizeGender accepts the old app's Indonesian L/P codes alongside
// male/female (case-insensitive) and returns the stored value
// ("male"/"female", matching user_profiles.gender's check constraint) and
// whether the input was recognized at all.
func NormalizeGender(s string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "l", "laki-laki", "laki_laki", "male":
		return "male", true
	case "p", "perempuan", "female":
		return "female", true
	default:
		return "", false
	}
}

// bloodTypes are the values ValidateBloodType accepts, Rh sign optional.
var bloodTypes = map[string]bool{
	"A": true, "B": true, "AB": true, "O": true,
	"A+": true, "A-": true, "B+": true, "B-": true,
	"AB+": true, "AB-": true, "O+": true, "O-": true,
}

// ValidateBloodType reports whether s (case-insensitive) is a recognized
// blood type. user_profiles.blood_type has no database check constraint,
// so this is the only place that catches a typo.
func ValidateBloodType(s string) bool {
	return bloodTypes[strings.ToUpper(strings.TrimSpace(s))]
}

// roleAliases maps the old app's Indonesian role names (and a few obvious
// English variants) to the seeded system role slugs
// (platform/authz.RoleDefaults), so an import file written against the
// old terminology still resolves.
var roleAliases = map[string]string{
	"siswa": "student", "murid": "student", "student": "student",
	"guru": "teacher", "pengajar": "teacher", "teacher": "teacher",
	"pegawai": "staff", "karyawan": "staff", "staf": "staff", "staff": "staff",
	"pustakawan": "librarian", "librarian": "librarian",
	"admin": "admin", "administrator": "admin",
	"super_admin": "super_admin", "superadmin": "super_admin",
}

// ResolveRoleAlias normalizes a role column's value to the slug it likely
// means: a known alias resolves to its system role slug; anything else
// passes through lowercased and trimmed, on the assumption it already
// names a tenant's own custom role slug.
func ResolveRoleAlias(s string) string {
	key := strings.ToLower(strings.TrimSpace(s))
	if slug, ok := roleAliases[key]; ok {
		return slug
	}
	return key
}

func validateProfileFields(row ImportRow) []ImportRowError {
	var errs []ImportRowError
	switch row.ProfileKind {
	case ProfileStudent:
		if row.NIS == "" {
			errs = append(errs, importRowError(ImportErrNISRequired, "nis"))
		}
	case ProfileTeacher:
		if row.NIP == "" {
			errs = append(errs, importRowError(ImportErrNIPRequired, "nip"))
		}
	case ProfileStaff:
		if row.EmployeeNumber == "" {
			errs = append(errs, importRowError(ImportErrEmployeeNumberRequired, "employee_number"))
		}
	}
	return errs
}
