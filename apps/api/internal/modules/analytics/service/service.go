// Package service holds the early-warning use cases: recomputing every
// student's risk signals on a schedule, and reading the stored results for
// the list and detail screens. It orchestrates domain.Score with three
// adapters over the modules that actually hold the data (attendance,
// discipline, grading) and its own Repository, and never imports pgx,
// chi, or another module's package directly, per
// docs/03-layered-architecture.md section 1.
package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// AcademicYearReader is the narrow interface analytics needs from the
// school module: every result is scoped to the tenant's active year.
type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
}

// AttendanceReader is a wiring adapter over the attendance module's own
// service, never its tables. MonthlySummary mirrors the shape family's
// AttendanceReader already uses (docs/03-layered-architecture.md section
// "Komunikasi antar modul").
type AttendanceReader interface {
	MonthlySummary(ctx context.Context, tenantID, studentID uuid.UUID, month string) ([]DayStatus, error)
}

// DayStatus is one calendar day's materialized attendance status for a
// student, as attendance's own daily summary computes it.
type DayStatus struct {
	Date       time.Time
	StatusCode string
}

// DisciplineReader is a wiring adapter over the discipline module's own
// service.
type DisciplineReader interface {
	StudentSummary(ctx context.Context, tenantID, studentID uuid.UUID) (DisciplineSummary, error)
}

type DisciplineSummary struct {
	ActiveViolationCount int
	TotalPoints          int
	WarningLetterCount   int
}

// GradingReader is a wiring adapter over the grading module's own service.
type GradingReader interface {
	ReportTrend(ctx context.Context, tenantID, studentID uuid.UUID) (GradeTrend, error)
}

// GradeTrend is the student's published report-score average for the
// active term and, when one exists, the term immediately before it.
// Available is false when there is no previous term to compare against
// (e.g. the student's first term at the school): the caller must not
// invent a trend in that case.
type GradeTrend struct {
	Available       bool
	PreviousAverage float64
	CurrentAverage  float64
}

// StudentRef is one actively enrolled student the recompute job scores.
type StudentRef struct {
	StudentUserID uuid.UUID
	ClassID       uuid.NullUUID
}

// StoredResult is one row of analytics_student_risk: the recompute job
// writes it, the list and detail screens only read it.
type StoredResult struct {
	AcademicYearID uuid.UUID
	StudentUserID  uuid.UUID
	ClassID        uuid.NullUUID
	Level          domain.Level
	Score          int
	Signals        domain.Signals
	Reasons        []domain.Reason
	PolicyVersion  int
	ComputedAt     time.Time
}

// Repository is analytics' data-access boundary: the roster and scope
// reads mirror the "cross-module read" pattern already used by
// attendance/discipline's own queries/cross_reads.sql (duty assignments,
// enrollments, classes are read directly rather than through an adapter,
// since they are administrative facts about the caller and the roster,
// not one of the three signals this module composes through adapters).
type Repository interface {
	ListActiveTenants(ctx context.Context) ([]uuid.UUID, error)
	ListActiveStudents(ctx context.Context, tenantID, academicYearID uuid.UUID) ([]StudentRef, error)
	GetHomeroomClassID(ctx context.Context, tenantID, academicYearID, teacherUserID uuid.UUID) (uuid.NullUUID, error)
	HasActiveDuty(ctx context.Context, tenantID, academicYearID, userID uuid.UUID, slug string) (bool, error)

	GetLatestPolicy(ctx context.Context, tenantID uuid.UUID) (config []byte, version int, found bool, err error)
	CreatePolicy(ctx context.Context, tenantID uuid.UUID, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error

	UpsertResult(ctx context.Context, tenantID uuid.UUID, r StoredResult) error
	ListResults(ctx context.Context, tenantID, academicYearID uuid.UUID, classID uuid.NullUUID) ([]StoredResult, error)
	GetResult(ctx context.Context, tenantID, academicYearID, studentID uuid.UUID) (StoredResult, bool, error)
}

var (
	ErrNoActiveAcademicYear = errors.New("no active academic year")
	ErrNotHomeroomTeacher   = errors.New("caller does not hold the homeroom duty for any class")
	ErrResultNotFound       = errors.New("risk result not found")
)

type Service struct {
	pool       *pgxpool.Pool
	repo       Repository
	years      AcademicYearReader
	attendance AttendanceReader
	discipline DisciplineReader
	grading    GradingReader
	clock      clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository, years AcademicYearReader, attendance AttendanceReader, discipline DisciplineReader, grading GradingReader, clk clock.Clock) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, repo: repo, years: years, attendance: attendance, discipline: discipline, grading: grading, clock: clk}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

func (s *Service) activeYear(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, error) {
	id, ok, err := s.years.GetActiveAcademicYearID(ctx, tenantID)
	if err != nil {
		return uuid.Nil, err
	}
	if !ok {
		return uuid.Nil, ErrNoActiveAcademicYear
	}
	return id, nil
}

// Policy returns the tenant's scoring policy, seeding DefaultPolicy on
// first read so every school starts with a working configuration.
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

// UpdatePolicy appends a new version of the tenant's scoring policy; the
// next recompute run picks it up.
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
