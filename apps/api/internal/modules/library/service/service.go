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
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
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

// ClassCount is one row of a per-class breakdown (visits or members),
// grouped by a student's current active class; ClassName is "" for a row
// the service should relabel as "Lainnya" (no active enrollment, or a
// visit that was never tied to a member at all).
type ClassCount struct {
	ClassName string
	Count     int
}

// MemberTypeCount is one row of the members-by-type report.
type MemberTypeCount struct {
	ID    uuid.UUID
	Name  string
	Count int
}

// BorrowerCount is one row of the top-borrowers report: a member's loan
// count in the period plus their current class, if any.
type BorrowerCount struct {
	MemberUserID uuid.UUID
	ClassName    string
	LoanCount    int
}

// TitleExportRow is one title plus the fields the catalogue XLSX export
// needs beyond domain.Title itself.
type TitleExportRow struct {
	Title            domain.Title
	MaterialTypeCode string
	TotalCopies      int
	AvailableCopies  int
}

// CopyExportRow is one copy plus its title and resolved master-data names
// for the catalogue XLSX export's Copies sheet.
type CopyExportRow struct {
	Copy         domain.Copy
	TitleName    string
	TitleAuthor  string
	CategoryName string
	LocationName string
	SourceName   string
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

	CountActiveStudentsTotal(ctx context.Context, tenantID uuid.UUID) (int, error)
	CountMembersTotal(ctx context.Context, tenantID uuid.UUID) (int, error)
	CountActiveMembersTotal(ctx context.Context, tenantID uuid.UUID) (int, error)
	CountVisitsBetween(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error)
	CountCopiesAddedInPeriod(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error)
	CountLateReturnsBetween(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error)
	SumFinesRecordedBetween(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (int, error)
	VisitsPerDay(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]DaySeriesPoint, error)
	VisitsPerClass(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]ClassCount, error)
	MembersByType(ctx context.Context, tenantID uuid.UUID) ([]MemberTypeCount, error)
	MembersByClass(ctx context.Context, tenantID uuid.UUID) ([]ClassCount, error)
	TopBorrowersInPeriod(ctx context.Context, tenantID uuid.UUID, from, to time.Time, limit int) ([]BorrowerCount, error)

	ListTitlesForExport(ctx context.Context, tenantID uuid.UUID) ([]TitleExportRow, error)
	ListCopiesForExport(ctx context.Context, tenantID uuid.UUID) ([]CopyExportRow, error)

	// CreateAsset records a stored file in the shared platform assets
	// table (migrations/0001_platform_core.up.sql); the same table and
	// convention internal/modules/permits/service already writes to for
	// evidence images and rendered letters.
	CreateAsset(ctx context.Context, tenantID uuid.UUID, bucket, objectKey, mime string, sizeBytes int64, sha256, kind, visibility string, createdBy uuid.UUID) (uuid.UUID, error)

	CreateCirculationEvent(ctx context.Context, e domain.ItemEventRecord) (domain.ItemEventRecord, error)
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

// Storage is the subset of platform/storage's client the library module
// needs: writing a downloaded cover image to the object store before
// recording it as an asset (same interface shape as
// internal/modules/permits/service.Storage, narrowed to the one method
// this module calls).
type Storage interface {
	PutObject(ctx context.Context, objectKey string, content []byte, contentType string) error
}

type Service struct {
	pool          *pgxpool.Pool
	repo          Repository
	members       MemberDirectory
	settings      SettingsReader
	flags         FlagReader
	permissions   PermissionChecker
	events        EventPublisher
	scanTokens    ScanTokens
	renderer      documents.Renderer
	clock         clock.Clock
	storage       Storage
	storageBucket string
	isbnCache     *isbnCache
	letterhead    reportdoc.LetterheadSource
}

// Deps bundles Service's optional collaborators beyond members and
// settings; New's positional members/settings arguments stay required
// since almost every use case needs them, but a test or a partially-wired
// caller can omit the rest.
type Deps struct {
	Flags         FlagReader
	Permissions   PermissionChecker
	Events        EventPublisher
	ScanTokens    ScanTokens
	Storage       Storage // nil: cover download is disabled
	StorageBucket string
	// Letterhead loads a tenant's configured kop laporan for the report
	// exports built on reportdoc; nil is fine (those exports just never
	// show one).
	Letterhead reportdoc.LetterheadSource
}

func New(pool *pgxpool.Pool, repo Repository, members MemberDirectory, settings SettingsReader, clk clock.Clock, deps ...Deps) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	s := &Service{
		pool: pool, repo: repo, members: members, settings: settings, renderer: documents.NewHTMLPDFRenderer(), clock: clk,
		isbnCache: newISBNCache(),
	}
	if len(deps) > 0 {
		d := deps[0]
		s.flags, s.permissions, s.events, s.scanTokens = d.Flags, d.Permissions, d.Events, d.ScanTokens
		s.storage, s.storageBucket = d.Storage, d.StorageBucket
		s.letterhead = d.Letterhead
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
