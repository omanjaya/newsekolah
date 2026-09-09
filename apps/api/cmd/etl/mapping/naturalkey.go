package mapping

import (
	"fmt"
	"regexp"
	"strings"
)

// StudentNaturalKey picks the stable identifier a re-run keys a student on:
// NISN first (the Kemdikbud national student number, unique nationwide and
// what the roadmap names explicitly), then NIS (school-local number), then
// username as a last resort for a record SION never assigned either number
// to. The returned source name goes straight into the difference report so
// an operator can see which students were matched on a weaker key.
func StudentNaturalKey(nisn, nis, username string) (key, source string) {
	if v := CleanNumericID(nisn); v != "" {
		return v, "nisn"
	}
	if v := CleanNumericID(nis); v != "" {
		return v, "nis"
	}
	return CleanUsername(username), "username"
}

// StaffNaturalKey picks the stable identifier for a teacher or other staff
// member: NIP (civil-servant/teacher registration number) first, then
// username. NUPTK is not used as a key because SION leaves it blank far more
// often than NIP.
func StaffNaturalKey(nip, username string) (key, source string) {
	if v := CleanNumericID(nip); v != "" {
		return v, "nip"
	}
	return CleanUsername(username), "username"
}

var nonSlugChar = regexp.MustCompile(`[^A-Z0-9]+`)

// SlugCode derives a code from a free-text name for tables where SION has no
// code column (subjects, classes are identified by name only). Result is
// uppercase, alphanumeric, hyphen-separated, and capped at maxLen to satisfy
// the new schema's `length(code) <= 20` checks on subjects and grade_levels.
func SlugCode(name string, maxLen int) string {
	upper := strings.ToUpper(strings.TrimSpace(name))
	slug := strings.Trim(nonSlugChar.ReplaceAllString(upper, "-"), "-")
	if slug == "" {
		slug = "X"
	}
	if len(slug) > maxLen {
		slug = strings.TrimRight(slug[:maxLen], "-")
	}
	return slug
}

// gradeSequence orders the grade codes newsekolah expects for SD/SMP/SMA/SMK
// (docs/12-roadmap.md's jenjang templates), used both to derive a
// grade_levels.sequence and to validate a parsed code is one ETL recognises.
var gradeSequence = map[string]int16{
	"1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
	"7": 7, "8": 8, "9": 9,
	"X": 10, "XI": 11, "XII": 12,
}

// ParseGradeFromClassName extracts the grade-level code from a SION class
// name such as "X-A", "XI IPA 1", or "7B", since SION has no separate
// grade_levels table: a class name's leading token is the grade. It reports
// false when the leading token is not one of the known grade codes, which
// the caller records as a gap instead of guessing a grade level.
func ParseGradeFromClassName(className string) (code string, sequence int16, ok bool) {
	trimmed := strings.TrimSpace(className)
	fields := strings.FieldsFunc(trimmed, func(r rune) bool {
		return r == '-' || r == ' ' || r == '_'
	})
	if len(fields) == 0 {
		return "", 0, false
	}
	head := strings.ToUpper(fields[0])
	// A leading run of digits followed by letters ("7B") splits into "7"
	// and the section; only the digit run is the grade.
	digits := strings.TrimRightFunc(head, func(r rune) bool { return r < '0' || r > '9' })
	for _, candidate := range []string{head, digits} {
		if seq, known := gradeSequence[candidate]; known {
			return candidate, seq, true
		}
	}
	return "", 0, false
}

// weekdaySequence is the ISO-ish convention the new scheduling module uses
// (Monday=1..Sunday=7), matching school_days.day_of_week and
// apps/api/internal/modules/scheduling/domain/schedule.go.
var weekdaySequence = map[string]int16{
	"monday":    1,
	"tuesday":   2,
	"wednesday": 3,
	"thursday":  4,
	"friday":    5,
	"saturday":  6,
	"sunday":    7,
}

// MapDayOfWeek translates SION's lowercase English weekday name
// (teaching_schedules.day_of_week) to the new schema's 1-7 integer.
func MapDayOfWeek(day string) (int16, bool) {
	v, ok := weekdaySequence[strings.ToLower(strings.TrimSpace(day))]
	return v, ok
}

// ClassNaturalKey identifies a class within one academic year: SION has no
// class code, only a name unique per (academic_year_id, name), which the new
// schema's `unique (academic_year_id, name)` constraint mirrors exactly.
func ClassNaturalKey(academicYearLabel, className string) string {
	return fmt.Sprintf("%s/%s", academicYearLabel, strings.TrimSpace(className))
}
