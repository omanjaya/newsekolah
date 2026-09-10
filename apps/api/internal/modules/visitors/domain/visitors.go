// Package domain holds the visitors module's entities: expected guests, the
// visits they turn into at the gate, and incidents recorded on campus.
//
// The module deliberately does not model a national identity number, an
// address, or a photograph for a guest. A guard only needs to say that an
// identification document was sighted and what kind it was, not to copy its
// number or keep a scan of it; a phone number and organization are enough
// for the office to reach someone back. Collecting less here means there is
// less to leak and less to justify keeping under data-protection rules that
// apply to a visitor who never consented to being a "student" or "staff"
// record in the first place.
package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrExpectedGuestNotFound  = errors.New("expected guest not found")
	ErrExpectedGuestResolved  = errors.New("expected guest entry already resolved")
	ErrVisitNotFound          = errors.New("visit not found")
	ErrVisitAlreadyCheckedOut = errors.New("visit already checked out")
	ErrIncidentNotFound       = errors.New("incident not found")
	ErrIncidentAlreadyClosed  = errors.New("incident already closed")
	ErrIncidentForbidden      = errors.New("incident not visible to this user")
	ErrModuleDisabled         = errors.New("visitors module is disabled for this tenant")
	ErrInvalidInput           = errors.New("invalid input")
)

// IdentificationType is the kind of identification a guard sighted at the
// gate. The document itself, and its number, are never recorded.
type IdentificationType string

const (
	IDTypeNone          IdentificationType = ""
	IDTypeNationalCard  IdentificationType = "ktp"
	IDTypeDriverLicense IdentificationType = "sim"
	IDTypeStudentCard   IdentificationType = "kartu_pelajar"
	IDTypeStaffCard     IdentificationType = "kartu_pegawai"
	IDTypeOther         IdentificationType = "other"
)

func (t IdentificationType) Valid() bool {
	switch t {
	case IDTypeNone, IDTypeNationalCard, IDTypeDriverLicense, IDTypeStudentCard, IDTypeStaffCard, IDTypeOther:
		return true
	default:
		return false
	}
}

// ExpectedStatus tracks one expected-guest entry through its lifecycle.
type ExpectedStatus string

const (
	ExpectedPending   ExpectedStatus = "pending"
	ExpectedArrived   ExpectedStatus = "arrived"
	ExpectedExpired   ExpectedStatus = "expired"
	ExpectedCancelled ExpectedStatus = "cancelled"
)

// ExpectedGuest is one entry an office made ahead of a visit, so the guard
// can find a name at the gate instead of typing it from scratch.
type ExpectedGuest struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	FullName     string
	Organization string
	HostUserID   uuid.UUID
	Purpose      string
	ExpectedDate time.Time
	Notes        string
	Status       ExpectedStatus
	CreatedBy    uuid.UUID
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Visit is one guest's stay on campus: who came, from where, who they came
// to see, why, when they arrived and left, and whether identification was
// sighted at the gate.
type Visit struct {
	ID              uuid.UUID
	TenantID        uuid.UUID
	ExpectedGuestID uuid.NullUUID
	FullName        string
	Organization    string
	HostUserID      uuid.UUID
	Purpose         string
	IDChecked       bool
	IDType          IdentificationType
	BadgeNumber     string
	BadgeAssetID    uuid.NullUUID
	ArrivedAt       time.Time
	DepartedAt      *time.Time
	CheckedInBy     uuid.UUID
	CheckedOutBy    uuid.NullUUID
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (v Visit) OnCampus() bool { return v.DepartedAt == nil }

// OverdueAfter is how long a visitor can stay on campus before the gate
// board flags them as overstaying, so a guard notices someone who was
// never signed out rather than finding out at the end of the day.
const OverdueAfter = 8 * time.Hour

// BoardEntry is one row of the gate board: the visit plus whether it has
// run past the normal campus-day length without a checkout.
type BoardEntry struct {
	Visit   Visit
	Overdue bool
}

// Board turns the raw on-campus visits into what a guard sees, oldest
// arrival first (already the repository's order) with the overdue flag
// computed against now rather than stored, so it is always current.
func Board(onCampus []Visit, now time.Time) []BoardEntry {
	entries := make([]BoardEntry, len(onCampus))
	for i, v := range onCampus {
		entries[i] = BoardEntry{Visit: v, Overdue: v.OnCampus() && now.Sub(v.ArrivedAt) > OverdueAfter}
	}
	return entries
}

// IncidentReaderRole is what the service needs to know about a reader to
// decide whether one incident is visible to them: an incident may name
// people, so visibility is narrower than the general "can see visitors
// data" permission.
type IncidentReaderRole struct {
	IsReporter   bool
	IsSecurity   bool
	IsLeadership bool
}

// VisibleTo reports whether an incident may be opened by this reader: the
// person who filed it, campus security staff, or school leadership.
func (i Incident) VisibleTo(role IncidentReaderRole) bool {
	return role.IsReporter || role.IsSecurity || role.IsLeadership
}

// Severity is how serious an incident was.
type Severity string

const (
	SeverityLow      Severity = "low"
	SeverityMedium   Severity = "medium"
	SeverityHigh     Severity = "high"
	SeverityCritical Severity = "critical"
)

func (s Severity) Valid() bool {
	switch s {
	case SeverityLow, SeverityMedium, SeverityHigh, SeverityCritical:
		return true
	default:
		return false
	}
}

// Incident is a dated record of something that happened on campus. It may
// name people, which is why reading one is gated behind its own permission
// and every read is written to the audit log.
type Incident struct {
	ID              uuid.UUID
	TenantID        uuid.UUID
	OccurredAt      time.Time
	Severity        Severity
	Description     string
	PersonsInvolved string
	ActionTaken     string
	ReportedBy      uuid.UUID
	IsClosed        bool
	ClosedAt        *time.Time
	ClosedBy        uuid.NullUUID
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// DefaultBadgeNumberingTemplate mirrors the shape other numbered documents
// in the platform use (see permits.DefaultLeaveLetterNumberingTemplate),
// scoped to the visitor badge sequence rather than an academic year one.
const DefaultBadgeNumberingTemplate = "TAMU-{{seq}}/{{month_roman}}/{{year}}"
