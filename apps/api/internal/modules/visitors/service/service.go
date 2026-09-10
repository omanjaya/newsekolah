// Package service holds the visitors module's use cases: an expected-guest
// list an office enters ahead of time, the gate board a guard works from to
// sign guests in and out, and campus incidents with a restricted read.
package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// Repository is the sqlc-backed data boundary this service depends on.
type Repository interface {
	CreateExpectedGuest(ctx context.Context, g domain.ExpectedGuest) (domain.ExpectedGuest, error)
	GetExpectedGuest(ctx context.Context, tenantID, id uuid.UUID) (domain.ExpectedGuest, bool, error)
	ListExpectedGuests(ctx context.Context, tenantID uuid.UUID, date time.Time, includeResolved bool) ([]domain.ExpectedGuest, error)
	SetExpectedGuestStatus(ctx context.Context, tenantID, id uuid.UUID, status domain.ExpectedStatus) (domain.ExpectedGuest, bool, error)
	CancelExpectedGuest(ctx context.Context, tenantID, id uuid.UUID) error

	CreateVisit(ctx context.Context, v domain.Visit) (domain.Visit, error)
	GetVisit(ctx context.Context, tenantID, id uuid.UUID) (domain.Visit, bool, error)
	CheckOutVisit(ctx context.Context, tenantID, id uuid.UUID, departedAt time.Time, checkedOutBy uuid.UUID) (domain.Visit, bool, error)
	ListOnCampus(ctx context.Context, tenantID uuid.UUID) ([]domain.Visit, error)
	ListVisits(ctx context.Context, tenantID uuid.UUID, from, to time.Time, limit, offset int) ([]domain.Visit, error)
	VisitRecap(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (VisitRecapCounts, error)

	CreateIncident(ctx context.Context, in domain.Incident) (domain.Incident, error)
	GetIncident(ctx context.Context, tenantID, id uuid.UUID) (domain.Incident, bool, error)
	UpdateIncident(ctx context.Context, in domain.Incident) (domain.Incident, bool, error)
	CloseIncident(ctx context.Context, tenantID, id uuid.UUID, closedAt time.Time, closedBy uuid.UUID) (domain.Incident, bool, error)
	ListIncidents(ctx context.Context, tenantID uuid.UUID, from, to time.Time, includeClosed bool, limit, offset int) ([]domain.Incident, error)
	IncidentSeverityCounts(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (map[domain.Severity]int, error)

	HasActiveDuty(ctx context.Context, tenantID, yearID, userID uuid.UUID, slug string) (bool, error)
}

// VisitRecapCounts is the aggregate figures behind the daily/monthly recap.
type VisitRecapCounts struct {
	TotalVisits    int
	StillOnCampus  int
	AvgStayMinutes float64
}

// AcademicYearReader is what the badge numbering sequence needs from the
// school module, the same port shape discipline and permits already use.
type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
}

// DocumentIssuer is the permits module's numbering and rendering pipeline,
// reached through a wiring adapter so this module never imports permits.
type DocumentIssuer interface {
	IssueVisitorBadge(ctx context.Context, tenantID uuid.UUID, in BadgeDocument) (IssuedBadge, error)
	DocumentURL(ctx context.Context, tenantID, assetID uuid.UUID) (string, error)
}

type BadgeDocument struct {
	VisitID        uuid.UUID
	AcademicYearID uuid.UUID
	IssuerUserID   uuid.UUID
	Vars           map[string]any
}

type IssuedBadge struct {
	Number  string
	AssetID uuid.NullUUID
}

// FlagReader tells whether the visitors module is switched on for a
// tenant, reading the platform console's existing feature-flag storage
// rather than a second flag system of its own.
type FlagReader interface {
	IsModuleEnabled(ctx context.Context, tenantID uuid.UUID) (bool, error)
}

// AuditRecorder writes to the platform's existing audit log. A wiring
// adapter backs this with audit.RecordSimple; the indirection exists so the
// incident read path (every read must be recorded) is unit-testable
// without a database transaction.
type AuditRecorder interface {
	Record(ctx context.Context, tenantID uuid.UUID, action, entityType string, entityID uuid.UUID) error
}

type Service struct {
	pool  *pgxpool.Pool
	repo  Repository
	years AcademicYearReader
	docs  DocumentIssuer
	flags FlagReader
	audit AuditRecorder
	clock clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository, years AcademicYearReader, docs DocumentIssuer, flags FlagReader, auditor AuditRecorder, clk clock.Clock) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, repo: repo, years: years, docs: docs, flags: flags, audit: auditor, clock: clk}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// requireEnabled is the module's single enforcement point: every use case
// calls it first, so there is exactly one place that decides whether
// visitors is on for a tenant.
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

func (s *Service) activeYear(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error) {
	if s.years == nil {
		return uuid.Nil, false, nil
	}
	return s.years.GetActiveAcademicYearID(ctx, tenantID)
}
