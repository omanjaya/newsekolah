package domain

import (
	"time"

	"github.com/google/uuid"
)

// VisitKind is who is visiting the library.
type VisitKind string

const (
	VisitMember    VisitKind = "member"
	VisitNonMember VisitKind = "non_member"
	VisitGroup     VisitKind = "group"
)

func (k VisitKind) Valid() bool {
	switch k {
	case VisitMember, VisitNonMember, VisitGroup:
		return true
	}
	return false
}

// VisitSource is how a visit was recorded.
type VisitSource string

const (
	VisitSourceManual VisitSource = "manual"
	VisitSourceScan   VisitSource = "scan"
	VisitSourceKiosk  VisitSource = "kiosk"
)

func (s VisitSource) Valid() bool {
	switch s {
	case VisitSourceManual, VisitSourceScan, VisitSourceKiosk:
		return true
	}
	return false
}

// Visit is one library_visits row (the guest book).
type Visit struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	MemberUserID uuid.NullUUID
	VisitorName  string
	Kind         VisitKind
	Purpose      string
	GroupSize    int
	Source       VisitSource
	VisitedAt    time.Time
	CreatedBy    uuid.NullUUID
}

// visitDedupeWindow is how soon after a member's last recorded visit a new
// scan is folded into the same visit instead of creating a duplicate row
// (old app: "dedupe satu kunjungan per user per 30 menit").
const visitDedupeWindow = 30 * time.Minute

// IsDuplicateVisit reports whether a new visit at asOf for a member whose
// last visit was at lastVisitedAt should be treated as the same visit.
func IsDuplicateVisit(lastVisitedAt time.Time, asOf time.Time) bool {
	return !lastVisitedAt.IsZero() && asOf.Sub(lastVisitedAt) < visitDedupeWindow
}

// ReadInPlace is one library_read_in_place row: a copy read at a library
// table rather than checked out.
type ReadInPlace struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	CopyID       uuid.UUID
	MemberUserID uuid.NullUUID
	VisitorName  string
	StartedAt    time.Time
	EndedAt      *time.Time
	CreatedBy    uuid.NullUUID
}
