package service

import (
	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// MemberListFilter narrows Repository.ListMembers; a zero value lists
// everyone.
type MemberListFilter struct {
	Status       string
	MemberTypeID uuid.NullUUID
	Search       string
}

// ClearanceCounts is what domain.EligibleForClearance needs: the member's
// active loans and unpaid violations right now.
type ClearanceCounts struct {
	ActiveLoans      int
	UnpaidViolations int
}

// MemberCandidate is one row of Repository.ListMemberCandidates.
type MemberCandidate struct {
	UserID   uuid.UUID
	UserName string
}

// VisitSummary is the day's guest-book totals.
type VisitSummary struct {
	TotalVisits   int
	UniqueMembers int
	TotalPeople   int
}

// MemberLookupResult is one row of a member typeahead match.
type MemberLookupResult struct {
	UserID   uuid.UUID
	UserName string
	Username string
	NIS      string
	MemberNo string
}

// CopyLookupResult is one row of a copy typeahead match.
type CopyLookupResult struct {
	CopyID  uuid.UUID
	Barcode string
	Status  string
	TitleID uuid.UUID
	Title   string
}

// ClassRosterEntry is one enrolled student, for class textbook loans.
type ClassRosterEntry struct {
	UserID   uuid.UUID
	UserName string
}

// OverdueLoanDetail is one overdue loan plus the class and guardian phone
// the old app's overdue report showed (library_circulation_v2.go:634-678).
type OverdueLoanDetail struct {
	Loan          domain.Loan
	ClassName     string
	GuardianPhone string
}

// TenantRef is one tenant's id and timezone, for periodic jobs that must
// iterate every active tenant (reservation expiry, daily reminders).
type TenantRef struct {
	ID       uuid.UUID
	Timezone string
}

// OpacSearchParams narrows a public catalogue search.
type OpacSearchParams struct {
	Search               string
	ClassificationPrefix string
	MaterialTypeID       uuid.NullUUID
	Limit                int
	Offset               int
}
