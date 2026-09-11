// Package domain holds the library module's entities and the rules the old
// application spread across handlers: catalogue and copies, borrowing and
// fines against a tenant policy, the reservation queue, and stocktake
// reconciliation.
package domain

import (
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
)

var (
	ErrTitleNotFound          = errors.New("title not found")
	ErrTitleHasCopies         = errors.New("title still has copies")
	ErrControlNumberExists    = errors.New("control number already exists")
	ErrCopyNotFound           = errors.New("copy not found")
	ErrCopyBarcodeExists      = errors.New("copy barcode already exists")
	ErrCopyAccessionExists    = errors.New("copy accession number already exists")
	ErrCopyNotAvailable       = errors.New("copy is not available")
	ErrCopyOnLoan             = errors.New("copy is already on loan")
	ErrCopyHasLoanHistory     = errors.New("copy has loan history")
	ErrCopyStatusNotManual    = errors.New("status can only be set through circulation")
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
	ErrMasterDataNotFound     = errors.New("master data entry not found")
	ErrMasterDataCodeExists   = errors.New("code already in use")
	ErrMasterDataInUse        = errors.New("master data entry is still in use")
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
// and updated at return or stocktake. It is orthogonal to CopyStatus: a
// copy can be "available" and "fair" at once.
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

// CopyStatus is the circulation and shelf-life state of one physical copy.
// The vocabulary mirrors docs/06-database-schema.md:246 (English codes
// replacing the old app's Indonesian ones).
type CopyStatus string

const (
	CopyAvailable    CopyStatus = "available"
	CopyOnLoan       CopyStatus = "on_loan"
	CopyReserved     CopyStatus = "reserved"
	CopyDamaged      CopyStatus = "damaged"
	CopyLost         CopyStatus = "lost"
	CopyInRepair     CopyStatus = "in_repair"
	CopyProcessing   CopyStatus = "processing"
	CopyDonated      CopyStatus = "donated"
	CopyReserveStack CopyStatus = "reserve_stack"
	CopyUnknown      CopyStatus = "unknown"
)

// creatableStatuses is every status a copy may start in; on_loan and
// reserved only ever come from circulation, never from a create or a
// manual status change.
var creatableStatuses = map[CopyStatus]bool{
	CopyAvailable: true, CopyDamaged: true, CopyLost: true, CopyInRepair: true,
	CopyProcessing: true, CopyDonated: true, CopyReserveStack: true, CopyUnknown: true,
}

func (s CopyStatus) Creatable() bool { return creatableStatuses[s] }

// ManuallySettable is every status a librarian may switch a copy to by
// hand: the creatable set minus "unknown", which only stocktake assigns
// (mark_missing_as) since nobody chooses it on purpose.
func (s CopyStatus) ManuallySettable() bool { return s != CopyUnknown && creatableStatuses[s] }

// CopyAccess is how a copy may be used once borrowed at all: taken home,
// read on site only, or never lent (reference).
type CopyAccess string

const (
	AccessLoanable    CopyAccess = "loanable"
	AccessReadInPlace CopyAccess = "read_in_place"
	AccessReference   CopyAccess = "reference"
)

func (a CopyAccess) Valid() bool {
	switch a {
	case AccessLoanable, AccessReadInPlace, AccessReference:
		return true
	}
	return false
}

type Title struct {
	ID                uuid.UUID
	TenantID          uuid.UUID
	ControlNumber     string
	Title             string
	Subtitle          string
	Author            string
	Responsibility    string
	AdditionalAuthors string
	Publisher         string
	PublishPlace      string
	PublishYear       int
	Edition           string
	Pages             string
	Illustration      string
	Dimensions        string
	ISBN              string
	ISSN              string
	DDCNumber         string
	CallNumber        string
	Classification    string
	Subjects          string
	Language          string
	LiteraryForm      string
	TargetAudience    string
	Notes             string
	Abstract          string
	MaterialTypeID    uuid.NullUUID
	IsOPAC            bool
	CoverAssetID      uuid.NullUUID
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type Copy struct {
	ID              uuid.UUID
	TenantID        uuid.UUID
	TitleID         uuid.UUID
	AccessionNumber string
	Barcode         string
	CopyNumber      int
	CallNumber      string
	CategoryID      uuid.NullUUID
	LocationID      uuid.NullUUID
	SourceID        uuid.NullUUID
	PartnerID       uuid.NullUUID
	Price           int
	IsOPAC          bool
	RFID            string
	Access          CopyAccess
	Condition       CopyCondition
	Status          CopyStatus
	AcquiredOn      *time.Time
	Notes           string
	CreatedAt       time.Time
	UpdatedAt       time.Time
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

// MarkMissingAs is what Close does to copies that were expected but never
// scanned: mark them lost, mark them unknown (found nowhere, not
// confirmed lost), or leave their status untouched.
type MarkMissingAs string

const (
	MarkMissingAsLost    MarkMissingAs = "lost"
	MarkMissingAsUnknown MarkMissingAs = "unknown"
	MarkMissingAsNone    MarkMissingAs = "none"
)

func (m MarkMissingAs) Valid() bool {
	switch m {
	case MarkMissingAsLost, MarkMissingAsUnknown, MarkMissingAsNone, "":
		return true
	}
	return false
}

type Stocktake struct {
	ID                uuid.UUID
	TenantID          uuid.UUID
	Name              string
	StartedOn         time.Time
	EndedOn           *time.Time
	CoordinatorUserID uuid.UUID
	Status            StocktakeStatus
	Notes             string
	MissingCount      int
	UnexpectedCount   int
	MisplacedCount    int
	MarkMissingAs     MarkMissingAs
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// StocktakeScanOutcome is what happened when a code was scanned: it
// matched a known copy ("found"), or nothing in the catalogue recognised
// it ("rejected", instead of failing the whole scan request with a 404).
type StocktakeScanOutcome string

const (
	ScanFound    StocktakeScanOutcome = "found"
	ScanRejected StocktakeScanOutcome = "rejected"
)

type StocktakeScan struct {
	ID            uuid.UUID
	TenantID      uuid.UUID
	StocktakeID   uuid.UUID
	CopyID        uuid.NullUUID
	RawCode       string
	Outcome       StocktakeScanOutcome
	LocationID    uuid.NullUUID
	ScannedAt     time.Time
	ScannedByUser uuid.UUID
}

// ScanRecord pairs a recorded scan with the copy it matched, so the pure
// reconciliation below never needs to reach into a repository. Copy is the
// zero value when the scan was rejected.
type ScanRecord struct {
	Scan StocktakeScan
	Copy Copy
}

// MisplacedCopy is an expected copy that was scanned in a location other
// than the one it is shelved in.
type MisplacedCopy struct {
	Copy            Copy
	FoundLocationID uuid.UUID
}

// StocktakeResult is the reconciliation of what should be on the shelf
// against what a scan session actually found.
type StocktakeResult struct {
	ExpectedCount int
	ScannedCount  int
	Missing       []Copy          // expected copies never scanned as found
	Unexpected    []Copy          // scanned copies that were not part of the expected set (e.g. on loan, yet on the shelf)
	Misplaced     []MisplacedCopy // expected copies scanned at a location other than their own
}

// DiffStocktake compares the copies a stocktake session expected to find
// against what was actually scanned. It is pure so the reconciliation can
// be unit tested without a database. expected already excludes copies
// that cannot be on the shelf (on loan, lost, donated -- see
// ListCopiesForStocktake).
func DiffStocktake(expected []Copy, scans []ScanRecord) StocktakeResult {
	expectedByID := make(map[uuid.UUID]Copy, len(expected))
	for _, c := range expected {
		expectedByID[c.ID] = c
	}

	foundIDs := make(map[uuid.UUID]bool)
	var unexpected []Copy
	var misplaced []MisplacedCopy
	scannedCount := 0
	for _, rec := range scans {
		if rec.Scan.Outcome != ScanFound || !rec.Scan.CopyID.Valid {
			continue
		}
		scannedCount++
		foundIDs[rec.Copy.ID] = true
		exp, isExpected := expectedByID[rec.Copy.ID]
		if !isExpected {
			unexpected = append(unexpected, rec.Copy)
			continue
		}
		if rec.Scan.LocationID.Valid && exp.LocationID.Valid && rec.Scan.LocationID.UUID != exp.LocationID.UUID {
			misplaced = append(misplaced, MisplacedCopy{Copy: exp, FoundLocationID: rec.Scan.LocationID.UUID})
		}
	}

	var missing []Copy
	for _, c := range expected {
		if !foundIDs[c.ID] {
			missing = append(missing, c)
		}
	}

	return StocktakeResult{
		ExpectedCount: len(expected),
		ScannedCount:  scannedCount,
		Missing:       missing,
		Unexpected:    unexpected,
		Misplaced:     misplaced,
	}
}

var isbnStripPattern = regexp.MustCompile(`[-\s]`)

// NormalizeISBN strips hyphens and spaces and upper-cases the checksum
// "X" so "978-602-1" and "978 602 1x" compare equal to "9786021X". Create,
// update, search, and the external lookup all normalize before storing or
// matching (old app: libraryNormalizeISBN).
func NormalizeISBN(raw string) string {
	return strings.ToUpper(isbnStripPattern.ReplaceAllString(strings.TrimSpace(raw), ""))
}

// GenerateCallNumber builds the default call number the old app derived
// when a librarian left the field empty: the DDC number, then the first
// three letters of the author's name upper-cased, then the first letter
// of the title lower-cased (old app: libraryCallNumber). Returns "" when
// there isn't enough information (no DDC and no author).
func GenerateCallNumber(ddcNumber, author, title string) string {
	parts := make([]string, 0, 3)
	if ddcNumber != "" {
		parts = append(parts, ddcNumber)
	}
	if letters := firstLetters(author, 3); letters != "" {
		parts = append(parts, strings.ToUpper(letters))
	}
	if letter := firstLetters(title, 1); letter != "" {
		parts = append(parts, strings.ToLower(letter))
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, " ")
}

// firstLetters returns the first n letters of s, skipping anything that
// isn't a letter (so "de la Cruz" still yields "DEL" for n=3).
func firstLetters(s string, n int) string {
	var b strings.Builder
	for _, r := range s {
		if !unicode.IsLetter(r) {
			continue
		}
		b.WriteRune(r)
		if b.Len() >= n {
			break
		}
	}
	return b.String()
}
