// Package service holds the library module's use cases: the title and copy
// catalogue, borrowing and returning against a tenant circulation policy,
// the reservation queue for titles with every copy out, stocktake sessions,
// public OPAC search, and the circulation reports.
package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
)

// Repository is the library module's data boundary; repository.Repository
// implements it against Postgres.
type Repository interface {
	GetLatestPolicy(ctx context.Context, tenantID uuid.UUID) ([]byte, int, bool, error)
	CreatePolicy(ctx context.Context, tenantID uuid.UUID, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error

	CreateTitle(ctx context.Context, t domain.Title) (domain.Title, error)
	UpdateTitle(ctx context.Context, t domain.Title) (domain.Title, error)
	GetTitle(ctx context.Context, tenantID, id uuid.UUID) (domain.Title, bool, error)
	ListTitles(ctx context.Context, tenantID uuid.UUID, search string, limit, offset int) ([]domain.Title, error)
	CountTitleCopies(ctx context.Context, tenantID, titleID uuid.UUID) (int, error)
	CountAvailableCopies(ctx context.Context, tenantID, titleID uuid.UUID) (int, error)

	CreateCopy(ctx context.Context, c domain.Copy) (domain.Copy, error)
	GetCopy(ctx context.Context, tenantID, id uuid.UUID) (domain.Copy, bool, error)
	GetCopyByBarcode(ctx context.Context, tenantID uuid.UUID, barcode string) (domain.Copy, bool, error)
	ListCopiesForTitle(ctx context.Context, tenantID, titleID uuid.UUID) ([]domain.Copy, error)
	ListCopiesForStocktake(ctx context.Context, tenantID uuid.UUID) ([]domain.Copy, error)
	UpdateCopyStatus(ctx context.Context, tenantID, id uuid.UUID, status domain.CopyStatus, condition *domain.CopyCondition) (domain.Copy, error)

	CreateLoan(ctx context.Context, l domain.Loan) (domain.Loan, error)
	GetLoan(ctx context.Context, tenantID, id uuid.UUID) (domain.Loan, bool, error)
	GetActiveLoanForCopy(ctx context.Context, tenantID, copyID uuid.UUID) (domain.Loan, bool, error)
	CountActiveLoansForMember(ctx context.Context, tenantID, memberID uuid.UUID) (int, error)
	ReturnLoan(ctx context.Context, tenantID, id uuid.UUID, returnedAt time.Time, checkedInBy uuid.UUID, fineAmount int) (domain.Loan, bool, error)
	MarkLoanLost(ctx context.Context, tenantID, id uuid.UUID, returnedAt time.Time, checkedInBy uuid.UUID, fineAmount int) (domain.Loan, bool, error)
	RenewLoan(ctx context.Context, tenantID, id uuid.UUID, newDueOn time.Time) (domain.Loan, bool, error)
	MarkLoanFinePaid(ctx context.Context, tenantID, id uuid.UUID, paidAt time.Time) (domain.Loan, bool, error)
	ListLoansForMember(ctx context.Context, tenantID, memberID uuid.UUID, includeReturned bool, limit, offset int) ([]domain.Loan, error)
	ListOverdueLoans(ctx context.Context, tenantID uuid.UUID, asOf time.Time) ([]domain.Loan, error)
	ListLoansInPeriod(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]domain.Loan, error)
	MostBorrowedTitles(ctx context.Context, tenantID uuid.UUID, from, to time.Time, limit int) ([]TitleLoanCount, error)

	CreateReservation(ctx context.Context, r domain.Reservation) (domain.Reservation, error)
	GetReservation(ctx context.Context, tenantID, id uuid.UUID) (domain.Reservation, bool, error)
	ListReservationsForTitle(ctx context.Context, tenantID, titleID uuid.UUID) ([]domain.Reservation, error)
	ListReservationsForMember(ctx context.Context, tenantID, memberID uuid.UUID) ([]domain.Reservation, error)
	MarkReservationReady(ctx context.Context, tenantID, id uuid.UUID, readyAt, expiresAt time.Time) (domain.Reservation, bool, error)
	FulfillReservation(ctx context.Context, tenantID, id, loanID uuid.UUID) (domain.Reservation, bool, error)
	CancelReservation(ctx context.Context, tenantID, id uuid.UUID) (domain.Reservation, bool, error)

	CreateStocktake(ctx context.Context, s domain.Stocktake) (domain.Stocktake, error)
	GetStocktake(ctx context.Context, tenantID, id uuid.UUID) (domain.Stocktake, bool, error)
	ListStocktakes(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]domain.Stocktake, error)
	CloseStocktake(ctx context.Context, tenantID, id uuid.UUID, endedOn time.Time, notes string) (domain.Stocktake, bool, error)
	RecordStocktakeScan(ctx context.Context, scan domain.StocktakeScan) (domain.StocktakeScan, error)
	ListStocktakeScans(ctx context.Context, tenantID, stocktakeID uuid.UUID) ([]domain.StocktakeScan, error)
}

// TitleLoanCount is one row of the most-borrowed-titles report.
type TitleLoanCount struct {
	TitleID   uuid.UUID
	LoanCount int
}

// MemberDirectory resolves a member's display name for reports and printed
// cards without the library module depending on the identity module.
type MemberDirectory interface {
	UserDisplayName(ctx context.Context, tenantID, userID uuid.UUID) (string, error)
}

type Service struct {
	pool     *pgxpool.Pool
	repo     Repository
	members  MemberDirectory
	renderer documents.Renderer
	clock    clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository, members MemberDirectory, clk clock.Clock) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, repo: repo, members: members, renderer: documents.NewHTMLPDFRenderer(), clock: clk}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// Policy returns the tenant's circulation policy, seeding the platform
// default on first read so every school starts with sensible limits.
func (s *Service) Policy(ctx context.Context, tenantID uuid.UUID) (domain.Policy, error) {
	var policy domain.Policy
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		policy, err = s.loadPolicy(ctx, tenantID)
		return err
	})
	return policy, err
}

func (s *Service) loadPolicy(ctx context.Context, tenantID uuid.UUID) (domain.Policy, error) {
	raw, version, found, err := s.repo.GetLatestPolicy(ctx, tenantID)
	if err != nil {
		return domain.Policy{}, err
	}
	if !found {
		def := domain.DefaultPolicy()
		encoded, err := json.Marshal(def)
		if err != nil {
			return domain.Policy{}, err
		}
		if err := s.repo.CreatePolicy(ctx, tenantID, def.Version, encoded, s.clock.Now(), uuid.NullUUID{}); err != nil {
			return domain.Policy{}, err
		}
		return def, nil
	}
	var policy domain.Policy
	if err := json.Unmarshal(raw, &policy); err != nil {
		return domain.Policy{}, err
	}
	policy.Version = version
	return policy, nil
}

// UpdatePolicy appends a new version of the circulation policy.
func (s *Service) UpdatePolicy(ctx context.Context, tenantID, actorUserID uuid.UUID, next domain.Policy) (domain.Policy, error) {
	if err := next.Validate(); err != nil {
		return domain.Policy{}, err
	}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		next.Version = current.Version + 1
		encoded, err := json.Marshal(next)
		if err != nil {
			return err
		}
		return s.repo.CreatePolicy(ctx, tenantID, next.Version, encoded, s.clock.Now(), uuid.NullUUID{UUID: actorUserID, Valid: true})
	})
	return next, err
}
