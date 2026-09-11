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
	"github.com/jackc/pgx/v5/pgtype"
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
	MarkReservationReady(ctx context.Context, tenantID, id, copyID uuid.UUID, readyAt, expiresAt time.Time) (domain.Reservation, bool, error)
	FulfillReservation(ctx context.Context, tenantID, id, loanID uuid.UUID) (domain.Reservation, bool, error)
	CancelReservation(ctx context.Context, tenantID, id uuid.UUID) (domain.Reservation, bool, error)
	GetReservationForHeldCopy(ctx context.Context, tenantID, copyID uuid.UUID) (domain.Reservation, bool, error)
	ExpireReadyReservations(ctx context.Context, tenantID uuid.UUID, asOf time.Time) ([]domain.Reservation, error)
	ListActiveTenants(ctx context.Context) ([]TenantRef, error)
	GetTenantTimezone(ctx context.Context, tenantID uuid.UUID) (string, error)

	CreateStocktake(ctx context.Context, s domain.Stocktake) (domain.Stocktake, error)
	GetStocktake(ctx context.Context, tenantID, id uuid.UUID) (domain.Stocktake, bool, error)
	ListStocktakes(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]domain.Stocktake, error)
	CloseStocktake(ctx context.Context, tenantID, id uuid.UUID, endedOn time.Time, notes string) (domain.Stocktake, bool, error)
	RecordStocktakeScan(ctx context.Context, scan domain.StocktakeScan) (domain.StocktakeScan, error)
	ListStocktakeScans(ctx context.Context, tenantID, stocktakeID uuid.UUID) ([]domain.StocktakeScan, error)

	CreateItemEvent(ctx context.Context, e domain.ItemEventRecord) (domain.ItemEventRecord, error)
	ListItemEventsForCopy(ctx context.Context, tenantID, copyID uuid.UUID) ([]domain.ItemEventRecord, error)
	CreateLoanRenewal(ctx context.Context, ren domain.LoanRenewal) (domain.LoanRenewal, error)
	ListLoanRenewalsForLoan(ctx context.Context, tenantID, loanID uuid.UUID) ([]domain.LoanRenewal, error)
	GetLoanByBarcode(ctx context.Context, tenantID uuid.UUID, barcode string) (domain.Loan, bool, error)

	CreateMemberType(ctx context.Context, t domain.MemberType) (domain.MemberType, error)
	UpdateMemberType(ctx context.Context, t domain.MemberType) (domain.MemberType, error)
	DeleteMemberType(ctx context.Context, tenantID, id uuid.UUID) (bool, error)
	GetMemberType(ctx context.Context, tenantID, id uuid.UUID) (domain.MemberType, bool, error)
	GetMemberTypeByRole(ctx context.Context, tenantID uuid.UUID, role string) (domain.MemberType, bool, error)
	ListMemberTypes(ctx context.Context, tenantID uuid.UUID) ([]domain.MemberType, error)
	CountMembersByType(ctx context.Context, tenantID, memberTypeID uuid.UUID) (int, error)

	CreateMember(ctx context.Context, m domain.Member) (domain.Member, error)
	GetMember(ctx context.Context, tenantID, userID uuid.UUID) (domain.Member, bool, error)
	GetMemberByNo(ctx context.Context, tenantID uuid.UUID, memberNo string) (domain.Member, bool, error)
	ListMembers(ctx context.Context, tenantID uuid.UUID, filter MemberListFilter, limit, offset int) ([]domain.Member, error)
	UpdateMemberStatus(ctx context.Context, tenantID, userID uuid.UUID, status domain.MemberStatus, suspendedUntil *pgtype.Date) (domain.Member, bool, error)
	UpdateMemberProfile(ctx context.Context, tenantID, userID, memberTypeID uuid.UUID, validUntil *time.Time, notes string) (domain.Member, bool, error)
	IncrementLateReturnCount(ctx context.Context, tenantID, userID uuid.UUID) (domain.Member, error)
	ClearanceCounts(ctx context.Context, tenantID, userID uuid.UUID) (ClearanceCounts, error)
	ListMemberCandidates(ctx context.Context, tenantID uuid.UUID, role string, classID uuid.NullUUID) ([]MemberCandidate, error)

	CreateLoanRule(ctx context.Context, rule domain.LoanRule) (domain.LoanRule, error)
	DeleteLoanRule(ctx context.Context, tenantID, id uuid.UUID) error
	ListLoanRulesActive(ctx context.Context, tenantID uuid.UUID, asOf time.Time) ([]domain.LoanRule, error)

	CreateViolation(ctx context.Context, v domain.Violation) (domain.Violation, error)
	GetViolation(ctx context.Context, tenantID, id uuid.UUID) (domain.Violation, bool, error)
	ListViolationsForMember(ctx context.Context, tenantID, memberID uuid.UUID) ([]domain.Violation, error)
	ListViolations(ctx context.Context, tenantID uuid.UUID, status, kind string, limit, offset int) ([]domain.Violation, error)
	SettleViolation(ctx context.Context, tenantID, id uuid.UUID, status domain.ViolationStatus, settledAt time.Time, settledBy uuid.UUID) (domain.Violation, bool, error)
	HasUnpaidFine(ctx context.Context, tenantID, memberID uuid.UUID) (bool, error)
	CountUnpaidViolations(ctx context.Context, tenantID, memberID uuid.UUID) (int, error)

	CreateVisit(ctx context.Context, v domain.Visit) (domain.Visit, error)
	GetLastVisitForMember(ctx context.Context, tenantID, memberID uuid.UUID) (domain.Visit, bool, error)
	ListVisitsForRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]domain.Visit, error)
	TodayVisitSummary(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (VisitSummary, error)
	CreateReadInPlace(ctx context.Context, p domain.ReadInPlace) (domain.ReadInPlace, error)
	ListReadInPlaceForCopy(ctx context.Context, tenantID, copyID uuid.UUID) ([]domain.ReadInPlace, error)

	HolidayDates(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (map[string]bool, error)
	LookupMembers(ctx context.Context, tenantID uuid.UUID, query string, limit int) ([]MemberLookupResult, error)
	LookupCopies(ctx context.Context, tenantID uuid.UUID, query string, limit int) ([]CopyLookupResult, error)
	ListClassRoster(ctx context.Context, tenantID, classID uuid.UUID) ([]ClassRosterEntry, error)
	HasActiveLoanForMemberAndTitle(ctx context.Context, tenantID, titleID, memberID uuid.UUID) (bool, error)
	ListOverdueLoansDetailed(ctx context.Context, tenantID uuid.UUID, asOf time.Time) ([]OverdueLoanDetail, error)
	GetActiveClassNameForStudent(ctx context.Context, tenantID, userID uuid.UUID) (string, error)
	ListLoansDueForReminder(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]domain.Loan, error)

	SearchOpacTitles(ctx context.Context, tenantID uuid.UUID, p OpacSearchParams) ([]domain.Title, error)
	GetOpacTitle(ctx context.Context, tenantID, id uuid.UUID) (domain.Title, bool, error)
	ListOpacCopiesForTitle(ctx context.Context, tenantID, titleID uuid.UUID) ([]domain.Copy, error)
	ListOpacNewestTitles(ctx context.Context, tenantID uuid.UUID, limit int) ([]domain.Title, error)
	ListOpacMostBorrowedTitles(ctx context.Context, tenantID uuid.UUID, limit int) ([]domain.Title, error)
}

// TitleLoanCount is one row of the most-borrowed-titles report.
type TitleLoanCount struct {
	TitleID   uuid.UUID
	LoanCount int
}

// MemberDirectory resolves a member's display name and role for reports,
// printed cards, and auto-registration without the library module
// depending on the identity module.
type MemberDirectory interface {
	UserDisplayName(ctx context.Context, tenantID, userID uuid.UUID) (string, error)
	// UserRole returns the identity module's user kind (student, teacher,
	// staff, parent), used to pick a member type's default_for_role at
	// auto-registration and to scope bulk registration.
	UserRole(ctx context.Context, tenantID, userID uuid.UUID) (string, bool, error)
}

// FlagReader tells whether the library module is switched on for a
// tenant, reading the platform console's existing feature-flag storage
// (same convention as internal/modules/visitors/service/service.go).
type FlagReader interface {
	IsModuleEnabled(ctx context.Context, tenantID uuid.UUID) (bool, error)
}

// PermissionChecker resolves whether a user holds one permission, for the
// self-or-staff scoping on member loan/reservation history: a member
// always sees their own records, anyone else needs view_library.
type PermissionChecker interface {
	HasPermission(ctx context.Context, tenantID, userID uuid.UUID, permission string) (bool, error)
}

// EventPublisher matches platform/events.Bus's Publish method structurally
// (same pattern as internal/modules/permits/service/service.go), so this
// package does not depend on platform/events beyond the Event interface.
type EventPublisher interface {
	Publish(ctx context.Context, evt Event) error
}

// Event is the minimal shape EventPublisher needs; platform/events.Envelope
// satisfies it.
type Event interface {
	EventName() string
}

// ScanTokens issues and consumes the shared scan_tokens rows for library
// kiosk check-in (purpose library_visit), backed at wiring time by the
// permits module's existing token pipeline rather than a second
// implementation of the same crypto.
type ScanTokens interface {
	IssueLibraryVisitToken(ctx context.Context, tenantID, issuedByUserID uuid.UUID) (rawValue string, expiresAt time.Time, err error)
	ConsumeLibraryVisitToken(ctx context.Context, tenantID uuid.UUID, rawValue string, consumedByUserID uuid.UUID) error
}

type Service struct {
	pool        *pgxpool.Pool
	repo        Repository
	members     MemberDirectory
	flags       FlagReader
	permissions PermissionChecker
	events      EventPublisher
	scanTokens  ScanTokens
	renderer    documents.Renderer
	clock       clock.Clock
}

// Deps bundles Service's optional collaborators; New's positional members
// argument stays required since almost every use case needs it, but a test
// or a partially-wired caller can omit the rest.
type Deps struct {
	Members     MemberDirectory
	Flags       FlagReader
	Permissions PermissionChecker
	Events      EventPublisher
	ScanTokens  ScanTokens
}

func New(pool *pgxpool.Pool, repo Repository, members MemberDirectory, clk clock.Clock, deps ...Deps) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	s := &Service{pool: pool, repo: repo, members: members, renderer: documents.NewHTMLPDFRenderer(), clock: clk}
	if len(deps) > 0 {
		d := deps[0]
		s.flags, s.permissions, s.events, s.scanTokens = d.Flags, d.Permissions, d.Events, d.ScanTokens
	}
	return s
}

// requireEnabled is the module's single enforcement point (same pattern as
// internal/modules/visitors/service/service.go): every use case that
// touches tenant data calls it first, so there is exactly one place that
// decides whether library is on for a tenant. The public OPAC read path
// calls it too -- the old app's withLibraryModule middleware covered every
// route, OPAC included.
func (s *Service) requireEnabled(ctx context.Context, tenantID uuid.UUID) error {
	if s.flags == nil {
		return nil
	}
	enabled, err := s.flags.IsModuleEnabled(ctx, tenantID)
	if err != nil {
		return err
	}
	if !enabled {
		return domain.ErrModuleDisabled
	}
	return nil
}

// HasPermission is the self-or-staff scoping check for member.go/reservations
// routes (x-permission: authenticated, scoped manually): true when no
// PermissionChecker was wired (never blocks a route the OpenAPI spec
// already gates elsewhere) or when the checker says the user holds it.
func (s *Service) HasPermission(ctx context.Context, tenantID, userID uuid.UUID, permission string) (bool, error) {
	if s.permissions == nil {
		return true, nil
	}
	return s.permissions.HasPermission(ctx, tenantID, userID, permission)
}

// publish is a no-op when no publisher was wired (tests, or a partial
// setup), so event side effects never panic a use case that only cares
// about the primary write.
func (s *Service) publish(ctx context.Context, evt Event) error {
	if s.events == nil {
		return nil
	}
	return s.events.Publish(ctx, evt)
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// Policy returns the tenant's circulation policy, seeding the platform
// default on first read so every school starts with sensible limits.
func (s *Service) Policy(ctx context.Context, tenantID uuid.UUID) (domain.Policy, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Policy{}, err
	}
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
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Policy{}, err
	}
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
