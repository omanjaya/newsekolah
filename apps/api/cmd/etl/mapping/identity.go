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

// attendanceStatusWords maps the live schema's attendance_details.status
// enum (spelled-out Indonesian words) to the new tenant's default
// tenant_policies(kind='attendance_statuses') single-letter codes
// (docs/06-database-schema.md section 4.3). A tenant that has customised its
// status catalog away from this default is out of scope for
// MapAttendanceStatus; the ETL report flags any word it does not recognise
// instead of writing it blind.
var attendanceStatusWords = map[string]string{
	"hadir":  "H",
	"sakit":  "S",
	"izin":   "I",
	"dispen": "D",
	"alpha":  "A",
}

// MapAttendanceStatus translates a live-schema attendance status word to the
// new schema's single-letter code.
func MapAttendanceStatus(word string) (code string, ok bool) {
	code, ok = attendanceStatusWords[strings.ToLower(strings.TrimSpace(word))]
	return code, ok
}
