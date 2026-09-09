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
	ParentApprovedAt     *time.Time
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
