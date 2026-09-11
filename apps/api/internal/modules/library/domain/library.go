// Package domain holds the library module's entities and the rules the old
// application spread across handlers: catalogue and copies, borrowing and
// fines against a tenant policy, the reservation queue, and stocktake
// reconciliation.
package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrTitleNotFound          = errors.New("title not found")
	ErrCopyNotFound           = errors.New("copy not found")
	ErrCopyBarcodeExists      = errors.New("copy barcode already exists")
	ErrCopyNotAvailable       = errors.New("copy is not available")
	ErrCopyOnLoan             = errors.New("copy is already on loan")
	ErrLoanNotFound           = errors.New("loan not found")
	ErrLoanAlreadyReturned    = errors.New("loan is already returned")
	ErrLoanLimitReached       = errors.New("member has reached the active loan limit")
	ErrRenewalLimitReached    = errors.New("loan has reached the renewal limit")
	ErrRenewalBlockedOverdue  = errors.New("an overdue loan cannot be renewed")
	ErrRenewalBlockedReserved = errors.New("the title has a waiting reservation")
	ErrReservationNotFound    = errors.New("reservation not found")
	ErrReservationNotWaiting  = errors.New("reservation is not waiting")
	ErrCopyAvailableForLoan   = errors.New("a copy is already available, no need to reserve")
	ErrStocktakeNotFound      = errors.New("stocktake not found")
	ErrStocktakeClosed        = errors.New("stocktake is already closed")
	ErrInvalidInput           = errors.New("invalid input")

	ErrModuleDisabled = errors.New("library module is disabled for this tenant")
	ErrLoansClosed    = errors.New("lending is closed for this date")
	ErrUnpaidFine     = errors.New("member has an unpaid fine")
	ErrForbidden      = errors.New("not permitted to view this member's records")

	ErrMemberNotFound      = errors.New("library member not found")
	ErrMemberAlreadyExists = errors.New("user is already a library member")
	ErrMemberNotActive     = errors.New("library member is not active")
	ErrMemberSuspended     = errors.New("library member is suspended")
	ErrMemberExpired       = errors.New("library membership has expired")
	ErrMemberNotClearable  = errors.New("member has active loans or unpaid fines")
	ErrMemberTypeNotFound  = errors.New("library member type not found")
	ErrMemberTypeInUse     = errors.New("library member type is in use")
	ErrMemberNoExhausted   = errors.New("could not generate a unique member number")
	ErrMemberNoCollision   = errors.New("member number already in use")

	ErrViolationNotFound       = errors.New("library violation not found")
	ErrViolationAlreadySettled = errors.New("library violation is already settled")

	ErrVisitNotFound = errors.New("library visit not found")
)

// CopyCondition is the physical state of one copy, recorded at acquisition
// and updated at return or stocktake.
type CopyCondition string

const (
	ConditionGood    CopyCondition = "good"
	ConditionFair    CopyCondition = "fair"
	ConditionDamaged CopyCondition = "damaged"
	ConditionLost    CopyCondition = "lost"
)

func (c CopyCondition) Valid() bool {
	switch c {
	case ConditionGood, ConditionFair, ConditionDamaged, ConditionLost:
		return true
	}
	return false
}

// CopyStatus is the circulation state of one physical copy.
type CopyStatus string

const (
	CopyAvailable CopyStatus = "available"
	CopyOnLoan    CopyStatus = "on_loan"
	CopyReserved  CopyStatus = "reserved"
	CopyWithdrawn CopyStatus = "withdrawn"
)

type Title struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	Title          string
	Subtitle       string
	Author         string
	Publisher      string
	PublishYear    int
	ISBN           string
	Classification string
	Language       string
	CoverAssetID   uuid.NullUUID
	IsOPAC         bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type Copy struct {
	ID         uuid.UUID
	TenantID   uuid.UUID
	TitleID    uuid.UUID
	Barcode    string
	Condition  CopyCondition
	Status     CopyStatus
	IsOPAC     bool
	AcquiredOn *time.Time
	Notes      string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (c Copy) CanBorrow() error {
	if c.Status != CopyAvailable {
		if c.Status == CopyOnLoan {
			return ErrCopyOnLoan
		}
		return ErrCopyNotAvailable
	}
	return nil
}

// CanBorrowBy is CanBorrow plus the one exception the old app allowed and
// the rebuild's first pass lost: a copy the module has already set aside
// (status reserved) for one member's ready hold is borrowable by that
// member, and only that member. Every other status is unchanged.
func (c Copy) CanBorrowBy(reservedForThisMember bool) error {
	if c.Status == CopyReserved && reservedForThisMember {
		return nil
	}
	return c.CanBorrow()
}

// LoanStatus is the state of one borrow record.
type LoanStatus string

const (
	LoanActive   LoanStatus = "active"
	LoanReturned LoanStatus = "returned"
	LoanLost     LoanStatus = "lost"
)

// Channel is where a loan was checked out from, so reports can tell desk
// traffic apart from self-service and the mobile app (old app's
// library_circulation.go "channel" column, dropped in the first pass).
type Channel string

const (
	ChannelDesk        Channel = "desk"
	ChannelSelfService Channel = "self_service"
	ChannelMobile      Channel = "mobile"
)

func (c Channel) Valid() bool {
	switch c {
	case ChannelDesk, ChannelSelfService, ChannelMobile:
		return true
	}
	return false
}

type Loan struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	CopyID       uuid.UUID
	TitleID      uuid.UUID
	MemberUserID uuid.UUID
	CheckedOutBy uuid.UUID
	BorrowedAt   time.Time
	DueOn        time.Time
	ReturnedAt   *time.Time
	CheckedInBy  uuid.NullUUID
	RenewalCount int
	Status       LoanStatus
	Channel      Channel
	FineAmount   int
	FinePaidAt   *time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (l Loan) IsOverdue(asOf time.Time) bool {
	return l.Status == LoanActive && asOf.After(l.DueOn)
}

// ReservationStatus is the state of one queued hold on a title.
type ReservationStatus string

const (
	ReservationWaiting   ReservationStatus = "waiting"
	ReservationReady     ReservationStatus = "ready"
	ReservationFulfilled ReservationStatus = "fulfilled"
	ReservationCancelled ReservationStatus = "cancelled"
	ReservationExpired   ReservationStatus = "expired"
)

type Reservation struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	TitleID      uuid.UUID
	MemberUserID uuid.UUID
	Status       ReservationStatus
	RequestedAt  time.Time
	ReadyAt      *time.Time
	ExpiresAt    *time.Time
	// HeldCopyID is the specific copy set aside once the reservation
	// becomes ready (regression fix: the first pass had no way to trace a
	// reserved copy back to the member it was held for).
	HeldCopyID      uuid.NullUUID
	FulfilledLoanID uuid.NullUUID
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// StocktakeStatus is the state of one opname session.
type StocktakeStatus string

const (
	StocktakeOpen   StocktakeStatus = "open"
	StocktakeClosed StocktakeStatus = "closed"
)

type Stocktake struct {
	ID                uuid.UUID
	TenantID          uuid.UUID
	Name              string
	StartedOn         time.Time
	EndedOn           *time.Time
	CoordinatorUserID uuid.UUID
	Status            StocktakeStatus
	Notes             string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type StocktakeScan struct {
	ID            uuid.UUID
	TenantID      uuid.UUID
	StocktakeID   uuid.UUID
	CopyID        uuid.UUID
	Barcode       string
	ScannedAt     time.Time
	ScannedByUser uuid.UUID
}

// StocktakeResult is the reconciliation of what should be on the shelf
// against what a scan session actually found.
type StocktakeResult struct {
	ExpectedCount int
	ScannedCount  int
	Missing       []Copy   // expected copies never scanned
	Unexpected    []string // scanned barcodes that match no expected copy
}

// DiffStocktake compares the copies a stocktake session expected to find
// (every copy not currently on loan) against the barcodes actually scanned.
// It is pure so the reconciliation can be unit tested without a database.
func DiffStocktake(expected []Copy, scannedBarcodes []string) StocktakeResult {
	scanned := make(map[string]bool, len(scannedBarcodes))
	for _, b := range scannedBarcodes {
		scanned[b] = true
	}
	byBarcode := make(map[string]bool, len(expected))
	var missing []Copy
	for _, c := range expected {
		byBarcode[c.Barcode] = true
		if !scanned[c.Barcode] {
			missing = append(missing, c)
		}
	}
	var unexpected []string
	for _, b := range scannedBarcodes {
		if !byBarcode[b] {
			unexpected = append(unexpected, b)
		}
	}
	return StocktakeResult{
		ExpectedCount: len(expected),
		ScannedCount:  len(scannedBarcodes),
		Missing:       missing,
		Unexpected:    unexpected,
	}
}
