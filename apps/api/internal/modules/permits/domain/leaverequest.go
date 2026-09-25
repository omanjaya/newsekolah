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

// DocumentKind is a leave_documents.kind value.
type DocumentKind string

const (
	DocumentKindEvidence DocumentKind = "evidence"
	DocumentKindLetter   DocumentKind = "letter"
)
