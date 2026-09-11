package domain

import "unicode/utf8"

// Field length limits mirrored from the check(length(...) <= n) constraints
// in migrations/0003_academic.up.sql (widened for classes.name by
// migrations/0100_class_name.up.sql). Kept here so a service rejects an
// oversized field with a 400 before it reaches Postgres, instead of a
// check-constraint violation surfacing as an unmapped 500 -- see
// service/errors.go's mapCheckViolation for the safety net on top of this.
const (
	MaxAcademicYearLabelLength  = 20
	MaxTermNameLength           = 50
	MaxCalendarEventNameLength  = 150
	MaxGradeLevelCodeLength     = 20
	MaxGradeLevelNameLength     = 100
	MaxTrackCodeLength          = 20
	MaxTrackNameLength          = 100
	MaxClassNameLength          = 150
	MaxSubjectCodeLength        = 20
	MaxSubjectNameLength        = 150
	MaxRoomCodeLength           = 20
	MaxRoomNameLength           = 100
	MaxPeriodTemplateNameLength = 100
	MaxPeriodNameLength         = 50
)

// ValidateMaxLength rejects a value longer than max, counted in runes --
// the same unit Postgres's length() uses against a UTF-8 text column.
func ValidateMaxLength(value string, max int) error {
	if utf8.RuneCountInString(value) > max {
		return ErrFieldTooLong
	}
	return nil
}
