package domain

// ImportRowError is one problem with one import row: a stable code the
// client translates (the web's app.school.users.import.rowError.<CODE>),
// the template column it concerns when there is one, and the values the
// translated sentence needs (a role slug, a length limit). The API never
// sends a prose sentence here, so an admin reads every row error in their
// own language.
type ImportRowError struct {
	Code   string
	Field  string
	Params map[string]string
}

// Import row error codes. Every code here needs an
// app.school.users.import.rowError entry in both apps/web/messages/id.json
// and en.json; the web falls back to a generic sentence for a code it does
// not know.
const (
	ImportErrNameRequired             = "NAME_REQUIRED"
	ImportErrNameTooLong              = "NAME_TOO_LONG"
	ImportErrProfileKindInvalid       = "PROFILE_KIND_INVALID"
	ImportErrRoleRequired             = "ROLE_REQUIRED"
	ImportErrPasswordTooShort         = "PASSWORD_TOO_SHORT"
	ImportErrPasswordTooLong          = "PASSWORD_TOO_LONG"
	ImportErrGenderInvalid            = "GENDER_INVALID"
	ImportErrBloodTypeInvalid         = "BLOOD_TYPE_INVALID"
	ImportErrBirthDateFormat          = "BIRTH_DATE_FORMAT"
	ImportErrNISRequired              = "NIS_REQUIRED"
	ImportErrNIPRequired              = "NIP_REQUIRED"
	ImportErrEmployeeNumberRequired   = "EMPLOYEE_NUMBER_REQUIRED"
	ImportErrEntryYearNotNumber       = "ENTRY_YEAR_NOT_NUMBER"
	ImportErrJoinedYearNotNumber      = "JOINED_YEAR_NOT_NUMBER"
	ImportErrUsernameDuplicateInBatch = "USERNAME_DUPLICATE_IN_FILE"
	ImportErrUsernameInUse            = "USERNAME_IN_USE"
	ImportErrEmailDuplicateInBatch    = "EMAIL_DUPLICATE_IN_FILE"
	ImportErrEmailInUse               = "EMAIL_IN_USE"
	ImportErrProfileKindImmutable     = "PROFILE_KIND_IMMUTABLE"
	ImportErrRoleNotFound             = "ROLE_NOT_FOUND"
	ImportErrSuperAdminGrantForbidden = "SUPER_ADMIN_GRANT_FORBIDDEN"
	ImportErrRoleNotSystem            = "ROLE_NOT_SYSTEM"
	ImportErrKindRoleMismatch         = "KIND_ROLE_MISMATCH"
	ImportErrPasswordInvalid          = "PASSWORD_INVALID"
)

// importRowError builds an ImportRowError for field, with params given as
// alternating key/value pairs.
func importRowError(code, field string, kv ...string) ImportRowError {
	e := ImportRowError{Code: code, Field: field}
	if len(kv) >= 2 {
		e.Params = make(map[string]string, len(kv)/2)
		for i := 0; i+1 < len(kv); i += 2 {
			e.Params[kv[i]] = kv[i+1]
		}
	}
	return e
}

// NewImportRowError is importRowError for callers outside this package
// (the service's database-backed checks).
func NewImportRowError(code, field string, kv ...string) ImportRowError {
	return importRowError(code, field, kv...)
}

// ImportRowErrorCodes returns just the codes of errs, in order: what tests
// and logs compare against.
func ImportRowErrorCodes(errs []ImportRowError) []string {
	if len(errs) == 0 {
		return nil
	}
	out := make([]string, len(errs))
	for i, e := range errs {
		out[i] = e.Code
	}
	return out
}
