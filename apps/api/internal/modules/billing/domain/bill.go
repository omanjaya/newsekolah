package domain

import (
	"time"

	"github.com/google/uuid"
)

// BillStatus is derived, never set directly by a caller: StatusFor is the
// only place that decides it, from amount and paid.
type BillStatus string

const (
	BillUnpaid  BillStatus = "unpaid"
	BillPartial BillStatus = "partial"
	BillPaid    BillStatus = "paid"
)

// StatusFor derives a bill's status from its owed amount and what has
// been paid against it so far. Called after every payment or void
// instead of a caller ever setting status by hand.
func StatusFor(amountMinor, paidMinor int64) BillStatus {
	switch {
	case paidMinor <= 0:
		return BillUnpaid
	case paidMinor < amountMinor:
		return BillPartial
	default:
		return BillPaid
	}
}

// Bill is one charge for one student for one period, generated from a fee
// type. FeeTypeName and the amount fields are a snapshot taken at
// generation time so a later edit to the fee type or a discount never
// rewrites a bill already issued.
type Bill struct {
	ID                  uuid.UUID
	TenantID            uuid.UUID
	AcademicYearID      uuid.UUID
	StudentUserID       uuid.UUID
	FeeTypeID           uuid.UUID
	FeeTypeName         string
	Currency            string
	Period              string
	DueDate             time.Time
	OriginalAmountMinor int64
	DiscountAmountMinor int64
	AmountMinor         int64
	PaidAmountMinor     int64
	Status              BillStatus
	GeneratedAt         time.Time
	GeneratedBy         uuid.NullUUID
}

// Outstanding is what is still owed on this bill; never negative because
// ValidatePayment refuses to let PaidAmountMinor exceed AmountMinor.
func (b Bill) Outstanding() int64 {
	if b.PaidAmountMinor >= b.AmountMinor {
		return 0
	}
	return b.AmountMinor - b.PaidAmountMinor
}

// ValidatePayment checks a proposed payment amount against a bill's
// current outstanding balance before it is ever written. A bill already
// paid in full, a zero or negative amount, and an amount larger than
// what remains are all refused rather than clamped: a silent clamp on
// money is worse than an error the front desk has to re-key.
func ValidatePayment(bill Bill, amountMinor int64) error {
	if amountMinor <= 0 {
		return ErrInvalidInput
	}
	if bill.Outstanding() <= 0 {
		return ErrBillAlreadyPaid
	}
	if amountMinor > bill.Outstanding() {
		return ErrPaymentExceedsOutstanding
	}
	return nil
}

// PaymentMethod is how the receiving officer recorded the money arriving.
// This module never talks to a payment gateway; every method here
// describes money that already changed hands by some other channel.
type PaymentMethod string

const (
	PaymentCash         PaymentMethod = "cash"
	PaymentBankTransfer PaymentMethod = "bank_transfer"
	PaymentOther        PaymentMethod = "other"
)

func (m PaymentMethod) Valid() bool {
	switch m {
	case PaymentCash, PaymentBankTransfer, PaymentOther:
		return true
	}
	return false
}

// Payment is one amount recorded against a bill. It is never deleted: a
// mistake is corrected by Void, which keeps who voided it and why.
type Payment struct {
	ID               uuid.UUID
	TenantID         uuid.UUID
	BillID           uuid.UUID
	AmountMinor      int64
	Method           PaymentMethod
	PaidOn           time.Time
	ReceivedByUserID uuid.UUID
	Reference        string
	ReceiptNumber    string
	ReceiptAssetID   uuid.NullUUID
	CreatedAt        time.Time
	VoidedAt         *time.Time
	VoidedByUserID   uuid.NullUUID
	VoidReason       string
}

func (p Payment) IsVoided() bool { return p.VoidedAt != nil }

// RecomputeBillPayments derives a bill's paid amount and status from its
// payments, ignoring voided ones. This is the one place that arithmetic
// happens; the service calls it inside the same transaction right after
// inserting or voiding a payment, instead of a database trigger doing it
// (docs/04-clean-code.md: no trigger carries business logic).
func RecomputeBillPayments(bill Bill, payments []Payment) Bill {
	var paid int64
	for _, p := range payments {
		if p.IsVoided() {
			continue
		}
		paid += p.AmountMinor
	}
	bill.PaidAmountMinor = paid
	bill.Status = StatusFor(bill.AmountMinor, paid)
	return bill
}
