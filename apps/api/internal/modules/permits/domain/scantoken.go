package domain

import (
	"time"

	"github.com/google/uuid"
)

// Purpose is a scan_tokens.purpose value. classroom_entry, library_visit,
// library_self_service, library_opname and kiosk are reserved for the
// attendance and library modules built later; permits only mints and
// consumes late_arrival, approve_stage and gate_exit tokens, but the
// purpose set here matches the shared table's CHECK constraint so those
// modules can start inserting through it without a migration.
type Purpose string

const (
	PurposeClassroomEntry     Purpose = "classroom_entry"
	PurposeLateArrival        Purpose = "late_arrival"
	PurposeApproveStage       Purpose = "approve_stage"
	PurposeGateExit           Purpose = "gate_exit"
	PurposeLibraryVisit       Purpose = "library_visit"
	PurposeLibrarySelfService Purpose = "library_self_service"
	PurposeLibraryOpname      Purpose = "library_opname"
	PurposeKiosk              Purpose = "kiosk"
)

func (p Purpose) Valid() bool {
	switch p {
	case PurposeClassroomEntry, PurposeLateArrival, PurposeApproveStage, PurposeGateExit,
		PurposeLibraryVisit, PurposeLibrarySelfService, PurposeLibraryOpname, PurposeKiosk:
		return true
	default:
		return false
	}
}

// shortLivedTTL is the TTL for a token meant to be displayed and scanned
// within a few seconds (docs/08-security.md section 7: "30 detik untuk
// kelas"). gate_exit is the one purpose that lives far longer -- until the
// end of the exit permit's last period -- computed by TokenTTL's caller
// from the actual period end time, not a fixed duration.
const shortLivedTTL = 30 * time.Second

// TokenTTL returns how long a freshly minted token of purpose stays valid.
// For PurposeGateExit, periodEndsAt is the wall-clock end of the exit
// permit's end period on the day it is issued; every other purpose ignores
// it and returns a fixed short TTL.
func TokenTTL(purpose Purpose, now time.Time, periodEndsAt time.Time) time.Duration {
	if purpose == PurposeGateExit {
		if d := periodEndsAt.Sub(now); d > 0 {
			return d
		}
		// The period has already ended (e.g. issued in its last minute):
		// still grant a short window rather than an already-expired token.
		return shortLivedTTL
	}
	return shortLivedTTL
}

// ScanToken is one scan_tokens row. The raw token value is never stored or
// returned after minting except in IssueResult; only Hash is persisted.
type ScanToken struct {
	ID               uuid.UUID
	TenantID         uuid.UUID
	Purpose          Purpose
	ContextID        uuid.NullUUID
	IssuedByUserID   uuid.UUID
	Hash             []byte
	ExpiresAt        time.Time
	ConsumedAt       *time.Time
	ConsumedByUserID uuid.NullUUID
	CreatedAt        time.Time
}

func (t ScanToken) IsConsumed() bool { return t.ConsumedAt != nil }

func (t ScanToken) IsExpired(now time.Time) bool { return now.After(t.ExpiresAt) }

// IssueResult is returned once, at mint time, carrying the only copy of
// the raw token value the caller (a teacher's device showing a QR code)
// will ever see.
type IssueResult struct {
	Token     ScanToken
	RawValue  string
	ExpiresAt time.Time
}
