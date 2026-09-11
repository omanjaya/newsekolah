package domain

import (
	"time"

	"github.com/google/uuid"
)

// ViolationKind is why a violation was recorded.
type ViolationKind string

const (
	ViolationLate    ViolationKind = "late"
	ViolationLost    ViolationKind = "lost"
	ViolationDamaged ViolationKind = "damaged"
	ViolationOther   ViolationKind = "other"
)

func (k ViolationKind) Valid() bool {
	switch k {
	case ViolationLate, ViolationLost, ViolationDamaged, ViolationOther:
		return true
	}
	return false
}

// Penalty is what a violation costs the member.
type Penalty string

const (
	PenaltyFine        Penalty = "fine"
	PenaltySuspend     Penalty = "suspend"
	PenaltyWarning     Penalty = "warning"
	PenaltyReplaceBook Penalty = "replace_book"
)

func (p Penalty) Valid() bool {
	switch p {
	case PenaltyFine, PenaltySuspend, PenaltyWarning, PenaltyReplaceBook:
		return true
	}
	return false
}

// ViolationStatus is the settlement state of a violation.
type ViolationStatus string

const (
	ViolationUnpaid ViolationStatus = "unpaid"
	ViolationPaid   ViolationStatus = "paid"
	ViolationWaived ViolationStatus = "waived"
)

// Violation is one library_violations row.
type Violation struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	LoanID       uuid.NullUUID
	MemberUserID uuid.UUID
	Kind         ViolationKind
	Penalty      Penalty
	Amount       int
	SuspendDays  int
	Status       ViolationStatus
	Notes        string
	CreatedBy    uuid.UUID
	CreatedAt    time.Time
	SettledAt    *time.Time
	SettledBy    uuid.NullUUID
}

func (v Violation) IsSettled() bool { return v.Status != ViolationUnpaid }

// LateOutcome is what a late return resolves to under the member's type
// and the tenant's fine settings, mirroring the old app's decision at
// library_common.go:284-296: a currency fine when fines are enabled (one
// of two formulas), otherwise a suspension of the member for the type's
// suspend_days, otherwise, if neither applies, a bare warning.
type LateOutcome struct {
	Penalty     Penalty
	FineAmount  int
	SuspendDays int
}

// ComputeLateOutcome is pure so the fine/suspend/warning decision can be
// unit tested without a database. lateDays must already be computed in
// working days (WorkingDayRule.WorkingDaysLate); zero lateDays never
// reaches here since callers only call it once a loan is confirmed late.
func ComputeLateOutcome(lateDays int, fineCurrencyEnabled bool, t MemberType) LateOutcome {
	if fineCurrencyEnabled {
		switch t.FineType {
		case FinePerTenor:
			tenors := lateDays / t.TenorDays
			if lateDays%t.TenorDays != 0 {
				tenors++
			}
			return LateOutcome{Penalty: PenaltyFine, FineAmount: tenors * t.FinePerTenor}
		default: // FineConstant: a single flat charge regardless of how many days late
			return LateOutcome{Penalty: PenaltyFine, FineAmount: t.FinePerTenor}
		}
	}
	if t.SuspendDays > 0 {
		return LateOutcome{Penalty: PenaltySuspend, SuspendDays: t.SuspendDays}
	}
	return LateOutcome{Penalty: PenaltyWarning}
}
