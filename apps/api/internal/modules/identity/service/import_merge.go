package service

import (
	"strconv"
	"strings"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
)

// mergeProfileFields overlays row's non-blank columns onto existing --
// the matched user's current profile fields, both the shared user_profiles
// columns and whichever kind-specific table applies -- and reports which
// field names actually changed. A blank cell in row means "leave this
// field as it is", never "clear it": an admin re-importing a partially
// filled sheet must not silently wipe data the sheet's author left out.
// row's format errors (entry_year/joined_year not numeric, birth_date not
// YYYY-MM-DD) were already collected by evaluateImportRow's call to
// buildImportProfileFields before this runs, so they are ignored here.
func mergeProfileFields(existing UserProfileFields, row domain.ImportRow) (UserProfileFields, []string) {
	merged := existing
	var changed []string

	note := func(name string, isChanged bool) {
		if isChanged {
			changed = append(changed, name)
		}
	}

	var ch bool
	merged.NIK, ch = mergeStringField(existing.NIK, row.NIK)
	note("nik", ch)
	merged.BirthPlace, ch = mergeStringField(existing.BirthPlace, row.BirthPlace)
	note("birth_place", ch)
	merged.Religion, ch = mergeStringField(existing.Religion, row.Religion)
	note("religion", ch)
	merged.Address, ch = mergeStringField(existing.Address, row.Address)
	note("address", ch)
	merged.District, ch = mergeStringField(existing.District, row.District)
	note("district", ch)
	merged.City, ch = mergeStringField(existing.City, row.City)
	note("city", ch)
	merged.NIS, ch = mergeStringField(existing.NIS, row.NIS)
	note("nis", ch)
	merged.NISN, ch = mergeStringField(existing.NISN, row.NISN)
	note("nisn", ch)
	merged.PreviousSchool, ch = mergeStringField(existing.PreviousSchool, row.PreviousSchool)
	note("previous_school", ch)
	merged.FatherName, ch = mergeStringField(existing.FatherName, row.FatherName)
	note("father_name", ch)
	merged.MotherName, ch = mergeStringField(existing.MotherName, row.MotherName)
	note("mother_name", ch)
	merged.GuardianName, ch = mergeStringField(existing.GuardianName, row.GuardianName)
	note("guardian_name", ch)
	merged.GuardianPhone, ch = mergeStringField(existing.GuardianPhone, row.GuardianPhone)
	note("guardian_phone", ch)
	merged.ParentOccupation, ch = mergeStringField(existing.ParentOccupation, row.ParentOccupation)
	note("parent_occupation", ch)
	merged.NIP, ch = mergeStringField(existing.NIP, row.NIP)
	note("nip", ch)
	merged.NUPTK, ch = mergeStringField(existing.NUPTK, row.NUPTK)
	note("nuptk", ch)
	merged.EmploymentStatus, ch = mergeStringField(existing.EmploymentStatus, row.EmploymentStatus)
	note("employment_status", ch)
	merged.LastEducation, ch = mergeStringField(existing.LastEducation, row.LastEducation)
	note("last_education", ch)
	merged.Specialization, ch = mergeStringField(existing.Specialization, row.Specialization)
	note("specialization", ch)
	merged.EmployeeNumber, ch = mergeStringField(existing.EmployeeNumber, row.EmployeeNumber)
	note("employee_number", ch)
	merged.Position, ch = mergeStringField(existing.Position, row.Position)
	note("position", ch)

	if row.Gender != "" {
		if g, ok := domain.NormalizeGender(row.Gender); ok {
			note("gender", g != existing.Gender)
			merged.Gender = g
		}
	}
	if row.BloodType != "" && domain.ValidateBloodType(row.BloodType) {
		bt := strings.ToUpper(strings.TrimSpace(row.BloodType))
		note("blood_type", bt != existing.BloodType)
		merged.BloodType = bt
	}
	if row.BirthDate != "" {
		if t, err := parseImportBirthDate(row.BirthDate); err == nil {
			note("birth_date", !t.Equal(existing.BirthDate))
			merged.BirthDate = t
		}
	}
	if row.EntryYear != "" {
		if y, err := strconv.Atoi(row.EntryYear); err == nil {
			note("entry_year", y != existing.EntryYear)
			merged.EntryYear = y
		}
	}
	if row.JoinedYear != "" {
		if y, err := strconv.Atoi(row.JoinedYear); err == nil {
			note("joined_year", y != existing.JoinedYear)
			merged.JoinedYear = y
		}
	}

	return merged, changed
}

// mergeStringField returns newValue if it is non-blank (reporting whether
// that differs from current), or current unchanged when newValue is
// blank -- the shared "a blank cell means leave it alone" rule every
// string column in an update row follows.
func mergeStringField(current, newValue string) (merged string, changed bool) {
	if newValue == "" {
		return current, false
	}
	return newValue, newValue != current
}

func parseImportBirthDate(s string) (time.Time, error) {
	return time.Parse(domain.ImportBirthDateLayout, s)
}
