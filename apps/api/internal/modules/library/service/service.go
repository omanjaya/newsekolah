// Package service holds the library module's use cases: catalogue master
// data, the title and copy catalogue, borrowing and returning against a
// tenant circulation policy, the reservation queue for titles with every
// copy out, stocktake sessions, public OPAC search, and the library's
// reports and dashboard.
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

// TitleFilter narrows ListTitles: an empty Search skips text matching, an
// empty SearchISBN skips the ISBN prefix match, and so on for every other
// field. Search and SearchISBN are set together by the service (the
// service normalizes ISBN separately from the free-text search phrase).
type TitleFilter struct {
	Search         string
	SearchISBN     string
	MaterialTypeID uuid.NullUUID
	DDCClass       string
	AvailableOnly  bool
	Sort           string // "" (title) or "newest"
}

// CopyFilter narrows ListCopiesFiltered the same way TitleFilter narrows
// ListTitles: a zero field is not applied.
type CopyFilter struct {
	TitleID    uuid.NullUUID
	Status     domain.CopyStatus
	CategoryID uuid.NullUUID
	LocationID uuid.NullUUID
	Search     string
}

// DDCClassCount is one row of the titles-by-DDC-class summary report.
type DDCClassCount struct {
	Code       string
	Name       string
	TitleCount int
}

// MasterEntryCount is one row of an items-by-category or
// items-by-material-type summary report.
type MasterEntryCount struct {
	ID    uuid.UUID
	Code  string
	Name  string
	Count int
}

// DaySeriesPoint is one day of a dashboard time series.
type DaySeriesPoint struct {
	Day   time.Time
	Count int
}

// StocktakeResultRow is one persisted stocktake anomaly, with the copy it
// refers to resolved (nil if the copy was later deleted).
type StocktakeResultRow struct {
	Outcome         string
	Copy            *domain.Copy
	FoundLocationID uuid.NullUUID
}

// LoanTitleRow is one loan with its title text already joined in, so the
// loans report doesn't need a GetTitle call per row.
type LoanTitleRow struct {
	Loan  domain.Loan
	Title string
}

// Repository is the library module's data boundary; repository.Repository
// implements it against Postgres.
type Repository interface {
	GetLatestPolicy(ctx context.Context, tenantID uuid.UUID) ([]byte, int, bool, error)
	CreatePolicy(ctx context.Context, tenantID uuid.UUID, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error

	CreateTitle(ctx context.Context, t domain.Title) (domain.Title, error)
	UpdateTitle(ctx context.Context, t domain.Title) (domain.Title, error)
	GetTitle(ctx context.Context, tenantID, id uuid.UUID) (domain.Title, bool, error)
	GetTitleByISBN(ctx context.Context, tenantID uuid.UUID, isbn string) (domain.Title, bool, error)
	DeleteTitle(ctx context.Context, tenantID, id uuid.UUID) (bool, error)
	ListTitles(ctx context.Context, tenantID uuid.UUID, f TitleFilter, limit, offset int) ([]domain.Title, error)
	CountTitleCopies(ctx context.Context, tenantID, titleID uuid.UUID) (int, error)
	CountAvailableCopies(ctx context.Context, tenantID, titleID uuid.UUID) (int, error)
	FindTitleForDedupe(ctx context.Context, tenantID uuid.UUID, isbn, title, author string) ([]domain.Title, error)

	CreateCopy(ctx context.Context, c domain.Copy) (domain.Copy, error)
	GetCopy(ctx context.Context, tenantID, id uuid.UUID) (domain.Copy, bool, error)
	GetCopyByBarcode(ctx context.Context, tenantID uuid.UUID, barcode string) (domain.Copy, bool, error)
	FindCopyByCode(ctx context.Context, tenantID uuid.UUID, code string) (domain.Copy, bool, error)
	ListCopiesForTitle(ctx context.Context, tenantID, titleID uuid.UUID) ([]domain.Copy, error)
	ListCopiesForStocktake(ctx context.Context, tenantID uuid.UUID) ([]domain.Copy, error)
	ListCopiesFiltered(ctx context.Context, tenantID uuid.UUID, f CopyFilter, limit, offset int) ([]domain.Copy, error)
	GetCopiesByIDs(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) ([]domain.Copy, error)
	UpdateCopyStatus(ctx context.Context, tenantID, id uuid.UUID, status domain.CopyStatus, condition *domain.CopyCondition) (domain.Copy, error)
	BulkUpdateCopyStatus(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID, status domain.CopyStatus) ([]domain.Copy, error)
	DeleteCopy(ctx context.Context, tenantID, id uuid.UUID) (bool, error)
	HasLoanHistory(ctx context.Context, tenantID, copyID uuid.UUID) (bool, error)
	CreateItemEvent(ctx context.Context, e domain.ItemEvent) error
	ListItemEvents(ctx context.Context, tenantID, copyID uuid.UUID) ([]domain.ItemEvent, error)
	NextAccessionSequence(ctx context.Context, tenantID uuid.UUID, year int) (int64, error)
	NextBarcodeSequence(ctx context.Context, tenantID uuid.UUID) (int64, error)

	CreateMaterialType(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error)
	UpdateMaterialType(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error)
	GetMaterialType(ctx context.Context, tenantID, id uuid.UUID) (domain.MasterEntry, bool, error)
	ListMaterialTypes(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error)
	DeleteMaterialType(ctx context.Context, tenantID, id uuid.UUID) (bool, error)
	CountMaterialTypeUsage(ctx context.Context, tenantID, id uuid.UUID) (int, error)

	CreateCollectionCategory(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error)
	UpdateCollectionCategory(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error)
	GetCollectionCategory(ctx context.Context, tenantID, id uuid.UUID) (domain.MasterEntry, bool, error)
	ListCollectionCategories(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error)
	DeleteCollectionCategory(ctx context.Context, tenantID, id uuid.UUID) (bool, error)
	CountCollectionCategoryUsage(ctx context.Context, tenantID, id uuid.UUID) (int, error)

	CreateAcquisitionSource(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error)
	UpdateAcquisitionSource(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error)
	GetAcquisitionSource(ctx context.Context, tenantID, id uuid.UUID) (domain.MasterEntry, bool, error)
	ListAcquisitionSources(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error)
	DeleteAcquisitionSource(ctx context.Context, tenantID, id uuid.UUID) (bool, error)
	CountAcquisitionSourceUsage(ctx context.Context, tenantID, id uuid.UUID) (int, error)

	CreatePartner(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error)
	UpdatePartner(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error)
	GetPartner(ctx context.Context, tenantID, id uuid.UUID) (domain.MasterEntry, bool, error)
	ListPartners(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error)
	DeletePartner(ctx context.Context, tenantID, id uuid.UUID) (bool, error)
	CountPartnerUsage(ctx context.Context, tenantID, id uuid.UUID) (int, error)

	CreateLocation(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error)
	UpdateLocation(ctx context.Context, e domain.MasterEntry) (domain.MasterEntry, error)
	GetLocation(ctx context.Context, tenantID, id uuid.UUID) (domain.MasterEntry, bool, error)
	ListLocations(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterEntry, error)
	DeleteLocation(ctx context.Context, tenantID, id uuid.UUID) (bool, error)
	CountLocationUsage(ctx context.Context, tenantID, id uuid.UUID) (int, error)

	ListDDCClasses(ctx context.Context) ([]domain.DDCClass, error)

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
	CloseStocktake(ctx context.Context, tenantID, id uuid.UUID, endedOn time.Time, notes string, result domain.StocktakeResult, markMissingAs domain.MarkMissingAs) (domain.Stocktake, bool, error)
	RecordStocktakeScan(ctx context.Context, scan domain.StocktakeScan) (domain.StocktakeScan, error)
	ListStocktakeScans(ctx context.Context, tenantID, stocktakeID uuid.UUID) ([]domain.StocktakeScan, error)
	CountStocktakeScans(ctx context.Context, tenantID, stocktakeID uuid.UUID) (int, error)
	InsertStocktakeResults(ctx context.Context, tenantID, stocktakeID uuid.UUID, result domain.StocktakeResult) error
	ListStocktakeResults(ctx context.Context, tenantID, stocktakeID uuid.UUID) ([]StocktakeResultRow, error)

	TitlesByDDCClass(ctx context.Context, tenantID uuid.UUID) ([]DDCClassCount, error)
	ItemsByCategory(ctx context.Context, tenantID uuid.UUID) ([]MasterEntryCount, error)
	ItemsByMaterialType(ctx context.Context, tenantID uuid.UUID) ([]MasterEntryCount, error)
	FictionRatioCounts(ctx context.Context, tenantID uuid.UUID) (fiction, total int, err error)
	CountTitlesAddedInPeriod(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error)
	CountActiveBorrowers(ctx context.Context, tenantID uuid.UUID) (int, error)
	CountOverdueNow(ctx context.Context, tenantID uuid.UUID, asOf time.Time) (int, error)
	GetLastClosedStocktake(ctx context.Context, tenantID uuid.UUID) (domain.Stocktake, bool, error)
	ListCopiesAcquiredInPeriod(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]domain.Copy, error)
	ListLoansInPeriodWithTitle(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]LoanTitleRow, error)

	CountTitlesActive(ctx context.Context, tenantID uuid.UUID) (int, error)
	CountCopiesTotal(ctx context.Context, tenantID uuid.UUID) (int, error)
	CountCopiesByStatus(ctx context.Context, tenantID uuid.UUID, status domain.CopyStatus) (int, error)
	CountLoansBetween(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error)
	CountReturnsBetween(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error)
	SumUnpaidFines(ctx context.Context, tenantID uuid.UUID) (int, error)
	ListLatestLoans(ctx context.Context, tenantID uuid.UUID, limit int) ([]domain.Loan, error)
	ListLongestOverdueLoans(ctx context.Context, tenantID uuid.UUID, asOf time.Time, limit int) ([]domain.Loan, error)
	PopularTitlesAllTime(ctx context.Context, tenantID uuid.UUID, limit int) ([]TitleLoanCount, error)
	DailyLoansSeries(ctx context.Context, tenantID uuid.UUID, since time.Time) ([]DaySeriesPoint, error)
	DailyReturnsSeries(ctx context.Context, tenantID uuid.UUID, since time.Time) ([]DaySeriesPoint, error)
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

// Settings is the small slice of tenant library settings this half of the
// module reads: the accession-number pattern and what a copy's default
// barcode is derived from. The circulation half owns the settings
// endpoints (docs task split); until it is wired in here, DefaultSettings
// answers with the old app's defaults so the catalogue keeps working on
// its own.
type Settings struct {
	// AccessionNumberPattern is the old app's "library.no_induk_format",
	// e.g. "YYYY/99999": "YYYY"/"YY" become the year, a run of "9"s
	// becomes the zero-padded sequence number.
	AccessionNumberPattern string
	// BarcodeSource is "accession_number" (copy the generated accession
	// number) or "sequence" (an 11-digit zero-padded running number).
	BarcodeSource string
}

func DefaultSettings() Settings {
	return Settings{AccessionNumberPattern: "YYYY/99999", BarcodeSource: "accession_number"}
}

// SettingsReader is the read-only interface onto tenant library settings.
// A nil reader (or one that errors) falls back to DefaultSettings.
type SettingsReader interface {
	LibrarySettings(ctx context.Context, tenantID uuid.UUID) (Settings, error)
}

type Service struct {
	pool     *pgxpool.Pool
	repo     Repository
	members  MemberDirectory
	settings SettingsReader
	renderer documents.Renderer
	clock    clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository, members MemberDirectory, settings SettingsReader, clk clock.Clock) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, repo: repo, members: members, settings: settings, renderer: documents.NewHTMLPDFRenderer(), clock: clk}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

func (s *Service) librarySettings(ctx context.Context, tenantID uuid.UUID) Settings {
	if s.settings == nil {
		return DefaultSettings()
	}
	cfg, err := s.settings.LibrarySettings(ctx, tenantID)
	if err != nil {
		return DefaultSettings()
	}
	if cfg.AccessionNumberPattern == "" {
		cfg.AccessionNumberPattern = DefaultSettings().AccessionNumberPattern
	}
	if cfg.BarcodeSource == "" {
		cfg.BarcodeSource = DefaultSettings().BarcodeSource
	}
	return cfg
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
