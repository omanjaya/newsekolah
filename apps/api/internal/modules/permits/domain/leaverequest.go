package domain

import (
	"time"

	"github.com/google/uuid"
)

// Category is a leave_requests.category value.
type Category string

const (
	CategoryReligiousCeremony Category = "religious_ceremony"
	CategorySick              Category = "sick"
	CategoryDispensation      Category = "dispensation"
	CategoryOther             Category = "other"
)

func (c Category) Valid() bool {
	switch c {
	case CategoryReligiousCeremony, CategorySick, CategoryDispensation, CategoryOther:
		return true
	default:
		return false
	}
}

// defaultCategoryLabels mirrors the old app's defaultReasons
// (student_leave_api.go): every category but "other" forces the reason to
// this fixed label, since "sakit" or "upacara agama" needs no free text
// and a student typing something else there is just noise on the letter.
var defaultCategoryLabels = map[Category]string{
	CategoryReligiousCeremony: "Upacara agama",
	CategorySick:              "Sakit",
	CategoryDispensation:      "Dispen",
}

// DefaultReasonFor returns the fixed reason a non-"other" category forces,
// or ok=false for "other" (and any unrecognized category), where the
// student's own free-text reason stands.
func DefaultReasonFor(c Category) (label string, ok bool) {
	label, ok = defaultCategoryLabels[c]
	return label, ok
}

// categoryLabels is the Indonesian display name of each category, as the
// web and mobile clients show it. The letter is a server-rendered
// Indonesian document, so it needs these names rather than the raw enum.
var categoryLabels = map[Category]string{
	CategoryReligiousCeremony: "Upacara keagamaan",
	CategorySick:              "Sakit",
	CategoryDispensation:      "Dispensasi",
	CategoryOther:             "Lainnya",
}

// CategoryLabel returns the category's Indonesian display name, or the
// raw value for an unrecognized one.
func CategoryLabel(c Category) string {
	if label, ok := categoryLabels[c]; ok {
		return label
	}
	return string(c)
}

// LeaveRequest is one leave_requests row, 1:1 with a workflow_instances
// row of kind leave_request. IssuedAt/LetterNumber/IssuedBy are set once
// the counselor stage issues the letter (the instance moves to
// StatusCompleted).
type LeaveRequest struct {
	InstanceID           uuid.UUID
	TenantID             uuid.UUID
	Category             Category
	Reason               string
	StartsOn             time.Time
	EndsOn               time.Time
	LetterNumber         string
	IssuedAt             *time.Time
	IssuedBy             uuid.NullUUID
	StudentNameSnapshot  string
	ClassNameSnapshot    string
	GuardianNameSnapshot string
}

func (r LeaveRequest) IsIssued() bool { return r.IssuedAt != nil }

// Days returns the inclusive number of calendar days the leave spans.
func (r LeaveRequest) Days() int {
	return int(r.EndsOn.Sub(r.StartsOn).Hours()/24) + 1
}

// SchoolDays returns how many of teaching (the days the student's class
// has lessons on, read by their year, month and day) fall within the
// leave's range: its real length, since a weekend or holiday inside the
// range is not a day of leave.
func (r LeaveRequest) SchoolDays(teaching []time.Time) int {
	from, to := dayKey(r.StartsOn), dayKey(r.EndsOn)
	n := 0
	for _, d := range teaching {
		if k := dayKey(d); k >= from && k <= to {
			n++
		}
	}
	return n
}

func dayKey(t time.Time) string { return t.Format("2006-01-02") }

// DocumentKind is a leave_documents.kind value.
type DocumentKind string

const (
	DocumentKindEvidence DocumentKind = "evidence"
	DocumentKindLetter   DocumentKind = "letter"
)
