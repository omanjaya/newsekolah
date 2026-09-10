// Package domain holds the billing module's entities and the pure
// arithmetic around them: how a discount reduces a charge, how a bill's
// paid amount and status follow from its payments, how a generation run
// stays idempotent, and how arrears roll up per student and per class.
// Nothing here touches a database or the network, so every rule is
// testable without either.
//
// Money is always an integer count of the tenant's minor currency unit
// (AmountMinor), never a float: this module targets Indonesian rupiah,
// which has no subunit in everyday use, so one minor unit here equals one
// rupiah (Currency is stored per fee type so a future tenant in another
// currency is not blocked, but nothing in this module assumes a subunit
// exists).
package domain

import (
	"strings"
	"time"

	"github.com/google/uuid"
)

// Recurrence is how often a fee type is charged.
type Recurrence string

const (
	RecurrenceMonthly Recurrence = "monthly"
	RecurrenceOneOff  Recurrence = "one_off"
)

func (r Recurrence) Valid() bool {
	return r == RecurrenceMonthly || r == RecurrenceOneOff
}

// FeeType is a named charge a school levies on some or all students: SPP
// (monthly) or a one-off charge such as uang pangkal or a field-trip fee.
type FeeType struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	Name           string
	Description    string
	AmountMinor    int64
	Currency       string
	Recurrence     Recurrence
	// Period is the fixed billing period for a one-off fee type (e.g.
	// "2026-07-uang-pangkal"); a monthly fee type takes its period from
	// the generation request instead, so this is empty for it.
	Period    string
	IsActive  bool
	CreatedBy uuid.NullUUID
	UpdatedBy uuid.NullUUID
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Normalize trims text fields and fills the default currency, mutating in
// place so callers can chain it directly into Validate.
func (f *FeeType) Normalize() {
	f.Name = strings.TrimSpace(f.Name)
	f.Description = strings.TrimSpace(f.Description)
	f.Period = strings.TrimSpace(f.Period)
	if f.Currency == "" {
		f.Currency = "IDR"
	}
}

func (f FeeType) Validate() error {
	if f.Name == "" || len(f.Name) > 150 {
		return ErrInvalidInput
	}
	if f.AmountMinor < 0 {
		return ErrInvalidInput
	}
	if !f.Recurrence.Valid() {
		return ErrInvalidInput
	}
	if f.Recurrence == RecurrenceOneOff && f.Period == "" {
		return ErrInvalidInput
	}
	if len(f.Currency) != 3 {
		return ErrInvalidInput
	}
	return nil
}

// BillingPeriod resolves the period a bill for this fee type carries: the
// caller-supplied period for a recurring charge, or the fee type's own
// fixed period for a one-off charge.
func (f FeeType) BillingPeriod(requested string) string {
	if f.Recurrence == RecurrenceOneOff {
		return f.Period
	}
	return requested
}

// DiscountKind is how a discount reduces a charge.
type DiscountKind string

const (
	DiscountPercentage DiscountKind = "percentage"
	DiscountFixed      DiscountKind = "fixed"
	DiscountWaiver     DiscountKind = "waiver"
)

func (k DiscountKind) Valid() bool {
	switch k {
	case DiscountPercentage, DiscountFixed, DiscountWaiver:
		return true
	}
	return false
}

// Discount is a per-student, per-fee-type reduction with a reason, e.g. a
// sibling discount or a scholarship waiver. Percentage is stored in basis
// points (1/100 of a percent, so 5000 = 50.00%) rather than a float, to
// keep the arithmetic in Apply entirely integer.
type Discount struct {
	ID              uuid.UUID
	TenantID        uuid.UUID
	FeeTypeID       uuid.UUID
	StudentUserID   uuid.UUID
	Kind            DiscountKind
	PercentageBp    int
	AmountMinor     int64
	Reason          string
	IsActive        bool
	CreatedByUserID uuid.NullUUID
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (d *Discount) Normalize() {
	d.Reason = strings.TrimSpace(d.Reason)
}

func (d Discount) Validate() error {
	if d.Reason == "" || len(d.Reason) > 300 {
		return ErrInvalidInput
	}
	if !d.Kind.Valid() {
		return ErrInvalidInput
	}
	switch d.Kind {
	case DiscountPercentage:
		if d.PercentageBp <= 0 || d.PercentageBp > 10000 {
			return ErrInvalidInput
		}
	case DiscountFixed:
		if d.AmountMinor <= 0 {
			return ErrInvalidInput
		}
	}
	return nil
}

// Apply returns the amount, in minor units, that this discount takes off
// a charge of originalMinor. It is always between 0 and originalMinor,
// even for a misconfigured fixed discount larger than the charge, so a
// bill's amount can never go negative.
func (d Discount) Apply(originalMinor int64) int64 {
	if !d.IsActive || originalMinor <= 0 {
		return 0
	}
	var discount int64
	switch d.Kind {
	case DiscountWaiver:
		discount = originalMinor
	case DiscountFixed:
		discount = d.AmountMinor
	case DiscountPercentage:
		discount = originalMinor * int64(d.PercentageBp) / 10000
	}
	return clamp(discount, 0, originalMinor)
}

func clamp(v, lo, hi int64) int64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
