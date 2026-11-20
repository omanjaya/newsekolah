package domain

import (
	"sort"
	"time"

	"github.com/google/uuid"
)

// Policy is the tenant's circulation policy (docs/02-system-design.md style
// tenant policy, stored by the library module itself rather than in
// tenant_policies -- see the module's migration notes). It also carries the
// library settings the old app kept in the generic settings table
// (library_common.go:47-71): a school-wide default for the loan/fine
// figures above (a member type or dated loan rule can still override
// them), numbering formats, weekend closure, booking, and fines.
type Policy struct {
	Version             int `json:"version"`
	LoanDays            int `json:"loan_days"`
	MaxActiveLoans      int `json:"max_active_loans"`
	MaxRenewals         int `json:"max_renewals"`
	RenewalDays         int `json:"renewal_days"`
	FinePerDay          int `json:"fine_per_day"`
	ReservationHoldDays int `json:"reservation_hold_days"`

	Name                      string `json:"name"`
	NPP                       string `json:"npp"`
	BarcodeSource             string `json:"barcode_source"` // "no_induk" | "item_id"
	AccessionFormat           string `json:"accession_format"`
	MemberNoFormat            string `json:"member_no_format"`
	SaturdayClosed            bool   `json:"saturday_closed"`
	SundayClosed              bool   `json:"sunday_closed"`
	BookingEnabled            bool   `json:"booking_enabled"`
	BookingMax                int    `json:"booking_max"`
	FineCurrencyEnabled       bool   `json:"fine_currency_enabled"`
	BlockLoansWithUnpaidFines bool   `json:"block_loans_with_unpaid_fines"`
	DueReminderDays           int    `json:"due_reminder_days"`
	AutoRegisterMembers       bool   `json:"auto_register_members"`
}

const (
	BarcodeSourceAccessionNumber = "no_induk"
	BarcodeSourceItemID          = "item_id"
)

func DefaultPolicy() Policy {
	return Policy{
		Version:             1,
		LoanDays:            7,
		MaxActiveLoans:      3,
		MaxRenewals:         1,
		RenewalDays:         7,
		FinePerDay:          1000,
		ReservationHoldDays: 2,

		Name:                      "Perpustakaan Sekolah",
		BarcodeSource:             BarcodeSourceAccessionNumber,
		AccessionFormat:           "YYYY/99999",
		MemberNoFormat:            "PS-YYYY-99999",
		SaturdayClosed:            true,
		SundayClosed:              true,
		BookingEnabled:            true,
		BookingMax:                2,
		FineCurrencyEnabled:       false,
		BlockLoansWithUnpaidFines: true,
		DueReminderDays:           2,
		AutoRegisterMembers:       true,
	}
}

//nolint:gocyclo // every field gets its own explicit range check; kept linear rather than a validation-rule table for a struct this size
func (p Policy) Validate() error {
	if p.LoanDays <= 0 || p.MaxActiveLoans <= 0 || p.MaxRenewals < 0 ||
		p.RenewalDays <= 0 || p.FinePerDay < 0 || p.ReservationHoldDays <= 0 {
		return ErrInvalidInput
	}
	if p.Name == "" || len(p.Name) > 150 || len(p.NPP) > 60 {
		return ErrInvalidInput
	}
	if p.BarcodeSource != BarcodeSourceAccessionNumber && p.BarcodeSource != BarcodeSourceItemID {
		return ErrInvalidInput
	}
	if p.AccessionFormat == "" || len(p.AccessionFormat) > 60 || p.MemberNoFormat == "" || len(p.MemberNoFormat) > 60 {
		return ErrInvalidInput
	}
	if p.BookingMax < 0 || p.DueReminderDays < 0 {
		return ErrInvalidInput
	}
	return nil
}

// WorkingDays is the weekend-closure half of the policy, for callers that
// combine it with the tenant's holiday dates to build a WorkingDayRule.
func (p Policy) WorkingDays(holidays map[string]bool) WorkingDayRule {
	return WorkingDayRule{SaturdayClosed: p.SaturdayClosed, SundayClosed: p.SundayClosed, Holidays: holidays}
}

// DueDate is the day a loan started on borrowedAt falls due under the policy.
func (p Policy) DueDate(borrowedAt time.Time) time.Time {
	return borrowedAt.AddDate(0, 0, p.LoanDays)
}

// RenewedDueDate is the new due date a renewal from asOf produces.
func (p Policy) RenewedDueDate(asOf time.Time) time.Time {
	return asOf.AddDate(0, 0, p.RenewalDays)
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

// RenewalLimits is how many times a loan may be renewed and by how many
// working days each renewal extends it, for a member of type t: the member
// type's own figures, which the settings screen edits per type, and the
// tenant policy's only for a member with no type. A type's max_renewals of
// 0 means "never renewed" and is kept as it is, never read as unset.
func RenewalLimits(t MemberType, hasType bool, p Policy) (maxRenewals, renewalDays int) {
	if !hasType {
		return p.MaxRenewals, p.RenewalDays
	}
	renewalDays = p.RenewalDays
	if t.RenewalDays > 0 {
		renewalDays = t.RenewalDays
	}
	return t.MaxRenewals, renewalDays
}

// PolicyLateRule is the late-return rule for a member with no member type:
// the policy's "fine per day" charged for every working day late. It is a
// one-day period fine, not a constant one, so the per-day figure the
// settings screen names really is charged per day.
func PolicyLateRule(p Policy) MemberType {
	return MemberType{FineType: FinePerTenor, FinePerTenor: p.FinePerDay, TenorDays: 1}
}

// CanRenew checks the three rules the old system enforced: the loan must
// not already be at its renewal limit (maxRenewals, from RenewalLimits),
// must not currently be overdue, and the title must have no member waiting
// in the reservation queue. today is the school's calendar day
// (SchoolDay), so a loan stays renewable all through its due date.
func CanRenew(loan Loan, maxRenewals int, today time.Time, hasWaitingReservation bool) error {
	if loan.Status != LoanActive {
		return ErrLoanAlreadyReturned
	}
	if loan.RenewalCount >= maxRenewals {
		return ErrRenewalLimitReached
	}
	if loan.IsOverdue(today) {
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
