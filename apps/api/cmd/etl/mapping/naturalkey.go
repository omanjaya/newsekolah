package mapping

import (
	"fmt"
	"regexp"
	"strings"
	"time"
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
// name such as "X-A", "XI IPA 1", "7B", or "Kelas X1", since SION has no
// separate grade_levels table: a class name's leading token (after
// dropping a "Kelas" filler word, see below) is the grade. It reports
// false when that token is not one of the known grade codes, which the
// caller records as a gap instead of guessing a grade level.
func ParseGradeFromClassName(className string) (code string, sequence int16, ok bool) {
	trimmed := strings.TrimSpace(className)
	fields := strings.FieldsFunc(trimmed, func(r rune) bool {
		return r == '-' || r == ' ' || r == '_'
	})
	// Drop a leading "Kelas" ("grade"/"class" in Indonesian) filler word:
	// the same real school names its classes "X-1".."XII-12" in one
	// academic year but "Kelas X1".."Kelas XII-12" in another (confirmed
	// migrating its full history end to end, see
	// docs/analysis/etl-rehearsal-2026-09-25.md) -- the token that
	// actually carries the grade is the next one, not this filler word.
	if len(fields) > 1 && strings.EqualFold(fields[0], "kelas") {
		fields = fields[1:]
	}
	if len(fields) == 0 {
		return "", 0, false
	}
	head := strings.ToUpper(fields[0])
	// A leading run of digits followed by letters ("7B") splits into "7"
	// and the section; only the digit run is the grade.
	digits := strings.TrimRightFunc(head, func(r rune) bool { return r < '0' || r > '9' })
	// Symmetrically, a leading run of letters followed directly by digits
	// ("X1", "XI2", "XII10") splits into "X"/"XI"/"XII" and the section --
	// the same school glues the section number straight onto the roman
	// numeral instead of separating it with '-' or ' ' for some grades.
	var letters string
	if idx := strings.IndexFunc(head, func(r rune) bool { return r >= '0' && r <= '9' }); idx > 0 {
		letters = head[:idx]
	}
	for _, candidate := range []string{head, digits, letters} {
		if candidate == "" {
			continue
		}
		if seq, known := gradeSequence[candidate]; known {
			return candidate, seq, true
		}
	}
	return "", 0, false
}

// weekdaySequence is the ISO-ish convention the new scheduling module uses
// (Monday=1..Sunday=7), matching school_days.day_of_week and
// apps/api/internal/modules/scheduling/domain/schedule.go. Keys are
// Indonesian (the live source schema's schedules.day enum is
// 'Senin'..'Jumat', never English).
var weekdaySequence = map[string]int16{
	"senin":  1,
	"selasa": 2,
	"rabu":   3,
	"kamis":  4,
	"jumat":  5,
	"sabtu":  6,
	"minggu": 7,
}

// MapDayOfWeek translates the live source schema's Indonesian weekday name
// (schedules.day) to the new schema's 1-7 integer.
func MapDayOfWeek(day string) (int16, bool) {
	v, ok := weekdaySequence[strings.ToLower(strings.TrimSpace(day))]
	return v, ok
}

// WeekdayFromDate derives the same 1-7 encoding MapDayOfWeek returns
// (Monday=1..Sunday=7) directly from a calendar date, for source rows
// (attendance sessions) that carry a date rather than a schedules.day
// string. t should already be a bare calendar day (see LocalDate) -- a date
// has no time-of-day component to shift, so no tenant timezone is needed
// here, unlike LocalToUTC.
func WeekdayFromDate(t time.Time) int16 {
	if t.Weekday() == time.Sunday {
		return 7
	}
	return int16(t.Weekday()) //nolint:gosec // time.Weekday is always 0-6, safe to narrow
}

// ClassNaturalKey identifies a class within one academic year: SION has no
// class code, only a name unique per (academic_year_id, name), which the new
// schema's `unique (academic_year_id, name)` constraint mirrors exactly.
func ClassNaturalKey(academicYearLabel, className string) string {
	return fmt.Sprintf("%s/%s", academicYearLabel, strings.TrimSpace(className))
}
