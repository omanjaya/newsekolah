package mapping

import "strings"

// New tenant duty type slugs, from apps/api/cmd/seed/main.go's systemDuties.
const (
	DutyHomeroom   = "homeroom"
	DutyCounselor  = "counselor"
	DutyPicket     = "picket"
	DutyLeadership = "leadership"
	DutySecurity   = "security"
	DutyLibrarian  = "librarian"
)

// dutyKeywords maps a lowercase, trimmed substring found in a SION
// teacher_additional_duties.name or employee_additional_duties.name to the
// new duty slug. SION stores duty names as free text (school-entered), so
// matching is by keyword rather than a fixed enum; order matters; the first
// match wins.
var dutyKeywords = []struct {
	contains string
	slug     string
}{
	{"wali kelas", DutyHomeroom},
	{"walikelas", DutyHomeroom},
	{"bimbingan konseling", DutyCounselor},
	{"bimbingan dan konseling", DutyCounselor},
	{"guru bk", DutyCounselor},
	{" bk", DutyCounselor},
	{"piket", DutyPicket},
	{"wakil kepala sekolah", DutyLeadership},
	{"wakasek", DutyLeadership},
	{"kepala sekolah", DutyLeadership},
	{"satpam", DutySecurity},
	{"security", DutySecurity},
	{"perpustakaan", DutyLibrarian},
	{"pustakawan", DutyLibrarian},
	{"librar", DutyLibrarian},
}

// MapDuty translates a free-text SION duty name to a new duty type slug. It
// reports false when no keyword matches, which the caller records as a gap:
// the duty is not recreated and the affected assignment is skipped rather
// than invented.
func MapDuty(name string) (slug string, ok bool) {
	normalized := " " + strings.ToLower(strings.TrimSpace(name)) + " "
	for _, k := range dutyKeywords {
		if strings.Contains(normalized, k.contains) {
			return k.slug, true
		}
	}
	return "", false
}
