package mapping

import (
	"regexp"
	"strings"
)

var whitespaceRun = regexp.MustCompile(`\s+`)

// CleanName trims a person's name and collapses internal whitespace runs
// left over from SION's free-text VARCHAR columns (double spaces, tabs from
// copy-pasted spreadsheets). It never changes letter case: Indonesian names
// carry meaningful capitalisation (e.g. "Siti Nurhaliza binti Ahmad") that a
// blind title-case pass would get wrong.
func CleanName(raw string) string {
	trimmed := strings.TrimSpace(raw)
	return whitespaceRun.ReplaceAllString(trimmed, " ")
}

var nonDigit = regexp.MustCompile(`\D`)

// CleanNumericID strips everything but digits from an identifier such as
// NISN or NIP, which SION sometimes stores with stray spaces or dots from
// manual entry ("00.91.23.45.67"). An empty result means the source value
// had no usable digits.
func CleanNumericID(raw string) string {
	return nonDigit.ReplaceAllString(strings.TrimSpace(raw), "")
}

// CleanUsername lowercases and trims a username so a re-run does not create
// a duplicate user for "Budi" vs "budi ".
func CleanUsername(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

// MapGender translates SION's single-letter gender code to the new schema's
// spelled-out value. SION also allows NULL, which the caller should pass
// through as ok=false without invoking this function.
func MapGender(code string) (value string, ok bool) {
	switch strings.ToUpper(strings.TrimSpace(code)) {
	case "L":
		return "male", true
	case "P":
		return "female", true
	default:
		return "", false
	}
}

// employmentStatusAliases maps SION's mixed-case employment_status enum
// values (PNS, PPPK, GTY, Tetap, Kontrak, Honorer) to the lowercase free-text
// convention the new teacher/staff profile columns use (no CHECK constraint,
// but the rest of the codebase writes lowercase consistently).
var employmentStatusAliases = map[string]string{
	"pns":     "pns",
	"pppk":    "pppk",
	"gty":     "gty",
	"tetap":   "tetap",
	"kontrak": "kontrak",
	"honorer": "honorer",
}

// MapEmploymentStatus normalises a SION employment_status value. It reports
// false for anything outside the known set, which the caller records as a
// gap and leaves the field blank rather than guessing.
func MapEmploymentStatus(raw string) (value string, ok bool) {
	value, ok = employmentStatusAliases[strings.ToLower(strings.TrimSpace(raw))]
	return value, ok
}

// attendanceStatusCodes are the default status codes both systems agree on:
// SION's attendance_entries.status CHECK and the new tenant's default
// tenant_policies(kind='attendance_statuses') seed (docs/06-database-schema.md
// section 4.3). A tenant that has customised its status catalog away from
// this default is out of scope for CleanAttendanceStatus; the ETL report
// flags any code it does not recognise instead of writing it blind.
var attendanceStatusCodes = map[string]bool{
	"H": true, // hadir / present
	"S": true, // sakit / sick
	"I": true, // izin / permitted absence
	"D": true, // dispensasi / dispensation
	"A": true, // alpha / unexcused absence
}

// MapAttendanceStatus validates a SION attendance status code. The two
// systems use the same single-letter codes, so this is a pass-through
// validator rather than a translation table: it exists so a corrupt or
// unexpected code in the source data is reported instead of silently
// written to a column the target's UI does not know how to render.
func MapAttendanceStatus(code string) (value string, ok bool) {
	trimmed := strings.ToUpper(strings.TrimSpace(code))
	if attendanceStatusCodes[trimmed] {
		return trimmed, true
	}
	return "", false
}
