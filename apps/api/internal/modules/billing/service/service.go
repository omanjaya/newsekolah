// Package service holds the billing module's use cases: the fee-type and
// discount catalog, idempotent bill generation, recording and voiding
// payments, receipts issued through the permits document pipeline, and
// the arrears report for the finance office.
package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// BillFilter narrows ListBills to one period, status, or class.
type BillFilter struct {
	Period  string
	Status  domain.BillStatus
	ClassID uuid.NullUUID
	Limit   int
	Offset  int
}

// Repository is the billing module's data-access boundary, implemented by
// the sqlc-backed package in ../repository.
type Repository interface {
	ListFeeTypes(ctx context.Context, tenantID, yearID uuid.UUID, includeInactive bool) ([]domain.FeeType, error)
	ListActiveFeeTypes(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.FeeType, error)
	GetFeeType(ctx context.Context, tenantID, id uuid.UUID) (domain.FeeType, bool, error)
	CreateFeeType(ctx context.Context, t domain.FeeType) (domain.FeeType, error)
	UpdateFeeType(ctx context.Context, t domain.FeeType) (domain.FeeType, error)
	DeleteFeeType(ctx context.Context, tenantID, id uuid.UUID) error

	ListDiscountsForFeeType(ctx context.Context, tenantID, feeTypeID uuid.UUID) ([]domain.Discount, error)
	ListDiscountsForStudent(ctx context.Context, tenantID, studentID uuid.UUID) ([]domain.Discount, error)
	ListActiveDiscounts(ctx context.Context, tenantID uuid.UUID, feeTypeIDs []uuid.UUID) ([]domain.Discount, error)
	GetDiscount(ctx context.Context, tenantID, id uuid.UUID) (domain.Discount, bool, error)
	CreateDiscount(ctx context.Context, d domain.Discount) (domain.Discount, error)
	UpdateDiscount(ctx context.Context, d domain.Discount) (domain.Discount, error)
	DeleteDiscount(ctx context.Context, tenantID, id uuid.UUID) error

	ExistingBillKeys(ctx context.Context, tenantID uuid.UUID, feeTypeIDs []uuid.UUID, period string) (map[domain.BillKey]bool, error)
	CreateBills(ctx context.Context, bills []domain.Bill) ([]domain.Bill, error)
	ListBills(ctx context.Context, tenantID, yearID uuid.UUID, f BillFilter) ([]domain.Bill, error)
	GetBill(ctx context.Context, tenantID, id uuid.UUID) (domain.Bill, bool, error)
	ListBillsForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]domain.Bill, error)
	ListOutstandingBills(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.Bill, error)
	UpdateBillPayment(ctx context.Context, tenantID, billID uuid.UUID, paidMinor int64, status domain.BillStatus) error

	CreatePayment(ctx context.Context, p domain.Payment) (domain.Payment, error)
	GetPayment(ctx context.Context, tenantID, id uuid.UUID) (domain.Payment, bool, error)
	ListPaymentsForBill(ctx context.Context, tenantID, billID uuid.UUID) ([]domain.Payment, error)
	VoidPayment(ctx context.Context, tenantID, id, voidedBy uuid.UUID, reason string) (domain.Payment, bool, error)
	SetPaymentReceipt(ctx context.Context, tenantID, paymentID uuid.UUID, number string, assetID uuid.NullUUID) error

	ListActiveEnrollments(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.StudentEnrollment, error)
	StudentDisplay(ctx context.Context, tenantID, studentID, yearID uuid.UUID) (StudentDisplay, error)
}

// StudentDisplay is the name/class/guardian trio printed on a receipt,
// read across from identity and academic (docs/03-layered-architecture.md
// section on cross-module reads).
type StudentDisplay struct {
	StudentName  string
	ClassName    string
	ClassID      uuid.NullUUID
	GuardianName string
}

// AcademicYearReader is what billing needs from the school module.
type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
}

// ReceiptDocument is what the service hands to the document pipeline to
// render and number one payment receipt.
type ReceiptDocument struct {
	PaymentID      uuid.UUID
	AcademicYearID uuid.UUID
	IssuerUserID   uuid.UUID
	Vars           map[string]any
}

// IssuedReceipt is what the document pipeline hands back: the printed
// number and, when object storage is configured, the stored PDF's asset.
type IssuedReceipt struct {
	Number  string
	AssetID uuid.NullUUID
}

// ReceiptIssuer is the permits module's document pipeline (numbering,
// rendering, storage), reached through a wiring adapter so billing never
// imports permits directly.
type ReceiptIssuer interface {
	IssueReceipt(ctx context.Context, tenantID uuid.UUID, in ReceiptDocument) (IssuedReceipt, error)
	DocumentURL(ctx context.Context, tenantID, assetID uuid.UUID) (string, error)
}

// FlagReader reports whether the platform console has billing turned on
// for a tenant. A nil FlagReader (tests, or a deployment that has not
// wired the platform module) leaves billing enabled, matching the
// feature_flags table's own opt-out default.
type FlagReader interface {
	BillingEnabled(ctx context.Context, tenantID uuid.UUID) (bool, error)
}

type Service struct {
	pool  *pgxpool.Pool
	repo  Repository
	years AcademicYearReader
	docs  ReceiptIssuer
	flags FlagReader
	clock clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository, years AcademicYearReader, docs ReceiptIssuer, flags FlagReader, clk clock.Clock) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, repo: repo, years: years, docs: docs, flags: flags, clock: clk}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// guard refuses every use case when the tenant has turned billing off,
// checked first so a disabled module never touches the database beyond
// the flag read itself.
func (s *Service) guard(ctx context.Context, tenantID uuid.UUID) error {
	if s.flags == nil {
		return nil
	}
	enabled, err := s.flags.BillingEnabled(ctx, tenantID)
	if err != nil {
		return err
	}
	if !enabled {
		return domain.ErrModuleDisabled
	}
	return nil
}

func (s *Service) activeYear(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, error) {
	id, ok, err := s.years.GetActiveAcademicYearID(ctx, tenantID)
	if err != nil {
		return uuid.Nil, err
	}
	if !ok {
		return uuid.Nil, domain.ErrNoActiveAcademicYear
	}
	return id, nil
}

func newID() uuid.UUID { return uuid.Must(uuid.NewV7()) }
