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
// from the time left until that period ends, not a fixed duration.
const shortLivedTTL = 30 * time.Second

// TokenTTL returns how long a freshly minted token of purpose stays valid.
// For PurposeGateExit, untilPeriodEnd is how long the exit permit's end
// period still runs on the school's (business) clock: the caller measures
// it on that clock, so a simulated morning mints a pass that lasts as
// long as the simulated lessons have left, not until the real date of the
// simulated day. Every other purpose ignores it and returns a fixed short
// TTL.
func TokenTTL(purpose Purpose, untilPeriodEnd time.Duration) time.Duration {
	if purpose == PurposeGateExit {
		if untilPeriodEnd > 0 {
			return untilPeriodEnd
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
//
// ExpiresAt and ValidFor describe the token to its holder. ValidFor is
// how long it stays usable, measured on the clock that set its length:
// the business clock for a gate pass (TokenTTL), the real clock for the
// rest. ExpiresAt is when that time runs out on the same clock, so under
// the time simulation a gate pass reads as valid until the simulated
// period end while the stored, real-clock expiry (Token.ExpiresAt) stays
// the same length away from the real now.
type IssueResult struct {
	Token     ScanToken
	RawValue  string
	ExpiresAt time.Time
	ValidFor  time.Duration
}

// AcceptsUnboundApproval reports whether a stage may be satisfied by an
// approve_stage token minted with no context (no workflow instance): the
// picket desk's rotating "izin keluar" QR (docs/07-ui-ux.md section 4,
// "Guru piket"). The student's scan names the instance instead, and the
// service binds the token to it when it consumes it.
//
// Only an exit permit's qr_scan stage whose rule is any_teacher qualifies.
// That rule is the one eligibility check that does not depend on which
// instance is approved (every active teacher passes it for every permit),
// so an unbound token grants its issuer nothing a bound one would not.
// Every other rule (a duty, the class's teacher now, the homeroom teacher)
// and every other kind keeps requiring a token bound to the instance, and
// a manual stage is never satisfied by any scan.
func AcceptsUnboundApproval(kind Kind, stage Stage) bool {
	return kind == KindExitPermit &&
		stage.ApproverRule == RuleAnyTeacher &&
		stage.Verification == VerificationQRScan
}
