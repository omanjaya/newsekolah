package domain

import (
	"sort"
	"time"

	"github.com/google/uuid"
)

// Policy is the tenant's circulation policy (docs/02-system-design.md style
// tenant policy, stored by the library module itself rather than in
// tenant_policies -- see the module's migration notes).
type Policy struct {
	Version             int `json:"version"`
	LoanDays            int `json:"loan_days"`
	MaxActiveLoans      int `json:"max_active_loans"`
	MaxRenewals         int `json:"max_renewals"`
	RenewalDays         int `json:"renewal_days"`
	FinePerDay          int `json:"fine_per_day"`
	ReservationHoldDays int `json:"reservation_hold_days"`
}

func DefaultPolicy() Policy {
	return Policy{
		Version:             1,
		LoanDays:            7,
		MaxActiveLoans:      3,
		MaxRenewals:         1,
		RenewalDays:         7,
		FinePerDay:          1000,
		ReservationHoldDays: 2,
	}
}

func (p Policy) Validate() error {
	if p.LoanDays <= 0 || p.MaxActiveLoans <= 0 || p.MaxRenewals < 0 ||
		p.RenewalDays <= 0 || p.FinePerDay < 0 || p.ReservationHoldDays <= 0 {
		return ErrInvalidInput
	}
	return nil
}

// DueDate is the day a loan started on borrowedAt falls due under the policy.
func (p Policy) DueDate(borrowedAt time.Time) time.Time {
	return borrowedAt.AddDate(0, 0, p.LoanDays)
}

// RenewedDueDate is the new due date a renewal from asOf produces.
func (p Policy) RenewedDueDate(asOf time.Time) time.Time {
	return asOf.AddDate(0, 0, p.RenewalDays)
}

// CalculateFine is a pure function of the policy and the two dates: zero
// when the copy came back on or before its due date, otherwise the whole
// number of calendar days late times the per-day rate.
func CalculateFine(p Policy, dueOn, returnedOn time.Time) int {
	dueDay := truncateToDay(dueOn)
	returnedDay := truncateToDay(returnedOn)
	if !returnedDay.After(dueDay) {
		return 0
	}
	lateDays := int(returnedDay.Sub(dueDay).Hours() / 24)
	return lateDays * p.FinePerDay
}

func truncateToDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

// CanBorrow checks the two independent preconditions for a new loan: the
// copy must be available, and the member must be under their active loan
// limit. It does not check outstanding fines -- callers that want to block
// borrowing on unpaid fines do so explicitly with the fine total they load.
func CanBorrow(item Copy, activeLoanCount int, p Policy) error {
	if err := item.CanBorrow(); err != nil {
		return err
	}
	if activeLoanCount >= p.MaxActiveLoans {
		return ErrLoanLimitReached
	}
	return nil
}

// CanRenew checks the three rules the old system enforced: the loan must
// not already be at its renewal limit, must not currently be overdue, and
// the title must have no member waiting in the reservation queue.
func CanRenew(loan Loan, p Policy, asOf time.Time, hasWaitingReservation bool) error {
	if loan.Status != LoanActive {
		return ErrLoanAlreadyReturned
	}
	if loan.RenewalCount >= p.MaxRenewals {
		return ErrRenewalLimitReached
	}
	if loan.IsOverdue(asOf) {
		return ErrRenewalBlockedOverdue
	}
	if hasWaitingReservation {
		return ErrRenewalBlockedReserved
	}
	return nil
}

// NextWaiting returns the reservation that should be served next: the
// earliest-requested one still in the waiting state, breaking a tie on
// requested_at by ID so ordering is deterministic. Reservations are served
// strictly in order, so a title's copies never jump the queue.
func NextWaiting(reservations []Reservation) (Reservation, bool) {
	waiting := make([]Reservation, 0, len(reservations))
	for _, r := range reservations {
		if r.Status == ReservationWaiting {
			waiting = append(waiting, r)
		}
	}
	if len(waiting) == 0 {
		return Reservation{}, false
	}
	sort.Slice(waiting, func(i, j int) bool {
		if !waiting[i].RequestedAt.Equal(waiting[j].RequestedAt) {
			return waiting[i].RequestedAt.Before(waiting[j].RequestedAt)
		}
		return waiting[i].ID.String() < waiting[j].ID.String()
	})
	return waiting[0], true
}

// QueuePosition is the 1-based position of reservationID among waiting
// reservations for its title, or 0 if it is not currently waiting.
func QueuePosition(reservations []Reservation, reservationID uuid.UUID) int {
	waiting := make([]Reservation, 0, len(reservations))
	for _, r := range reservations {
		if r.Status == ReservationWaiting {
			waiting = append(waiting, r)
		}
	}
	sort.Slice(waiting, func(i, j int) bool {
		if !waiting[i].RequestedAt.Equal(waiting[j].RequestedAt) {
			return waiting[i].RequestedAt.Before(waiting[j].RequestedAt)
		}
		return waiting[i].ID.String() < waiting[j].ID.String()
	})
	for i, r := range waiting {
		if r.ID == reservationID {
			return i + 1
		}
	}
	return 0
}
