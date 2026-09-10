// Package service holds the supervision use cases: a cycle's instrument,
// scheduling an observation against a specific lesson resolved through the
// scheduling module, completing an observation scored against the
// instrument's scale, and per-teacher reports exported to XLSX.
package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// Repository is supervision's data boundary.
type Repository interface {
	CreateCycle(ctx context.Context, c domain.SupervisionCycle) (domain.SupervisionCycle, error)
	UpdateCycle(ctx context.Context, c domain.SupervisionCycle) (domain.SupervisionCycle, error)
	GetCycle(ctx context.Context, tenantID, id uuid.UUID) (domain.SupervisionCycle, bool, error)
	ListCyclesForYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.SupervisionCycle, error)

	CreateScheduledObservation(ctx context.Context, o domain.ScheduledObservation) (domain.ScheduledObservation, error)
	GetScheduledObservation(ctx context.Context, tenantID, id uuid.UUID) (domain.ScheduledObservation, bool, error)
	ListScheduledForCycle(ctx context.Context, tenantID, cycleID uuid.UUID) ([]domain.ScheduledObservation, error)
	ListScheduledForTeacher(ctx context.Context, tenantID, cycleID, teacherUserID uuid.UUID) ([]domain.ScheduledObservation, error)

	CreateObservation(ctx context.Context, o domain.Observation) (domain.Observation, error)
	UpdateObservation(ctx context.Context, o domain.Observation) (domain.Observation, error)
	GetObservation(ctx context.Context, tenantID, id uuid.UUID) (domain.Observation, bool, error)
	GetObservationByScheduled(ctx context.Context, tenantID, scheduledID uuid.UUID) (domain.Observation, bool, error)
	ListObservationsForTeacherCycle(ctx context.Context, tenantID, cycleID, teacherUserID uuid.UUID) ([]domain.Observation, error)
	ListObservationsForCycle(ctx context.Context, tenantID, cycleID uuid.UUID) ([]domain.Observation, error)

	HasActiveDuty(ctx context.Context, tenantID, yearID, userID uuid.UUID, slug string) (bool, error)
	TeacherName(ctx context.Context, tenantID, teacherUserID uuid.UUID) (string, error)
}

// AcademicYearReader is what supervision needs from the school module.
type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
}

// ScheduleRef is the minimal shape of a scheduled lesson supervision needs
// to resolve a scheduled observation, mirroring scheduling's own
// ScheduleRef used by attendance.
type ScheduleRef struct {
	ID            uuid.UUID
	ClassID       uuid.UUID
	SubjectID     uuid.UUID
	TeacherUserID uuid.UUID
}

// ScheduleReader is the scheduling module reached through a wiring
// adapter: supervision resolves a scheduled observation against a real
// weekly teaching slot instead of trusting a caller-supplied teacher id.
type ScheduleReader interface {
	GetSchedule(ctx context.Context, tenantID, scheduleID uuid.UUID) (ScheduleRef, error)
}

// FlagChecker asks the platform module whether supervision is turned on
// for this tenant, reached through a wiring adapter.
type FlagChecker interface {
	IsModuleEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error)
}

const ModuleKey = "supervision"

type Service struct {
	pool      *pgxpool.Pool
	repo      Repository
	years     AcademicYearReader
	schedules ScheduleReader
	flags     FlagChecker
	clock     clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository, years AcademicYearReader, schedules ScheduleReader, flags FlagChecker, clk clock.Clock) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, repo: repo, years: years, schedules: schedules, flags: flags, clock: clk}
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
		return uuid.Nil, domain.ErrNoActiveAcademicYear
	}
	return id, nil
}

// requireEnabled fails a use case when the console has turned supervision
// off for this tenant. A nil FlagChecker leaves the module enabled,
// matching feature_flags' opt-out default elsewhere.
func (s *Service) requireEnabled(ctx context.Context, tenantID uuid.UUID) error {
	if s.flags == nil {
		return nil
	}
	enabled, err := s.flags.IsModuleEnabled(ctx, tenantID, ModuleKey)
	if err != nil {
		return err
	}
	if !enabled {
		return domain.ErrModuleDisabled
	}
	return nil
}

func (s *Service) observationReaderRole(ctx context.Context, tenantID, yearID, readerUserID, observerUserID, teacherUserID uuid.UUID) (domain.ObservationReader, error) {
	leadership, err := s.repo.HasActiveDuty(ctx, tenantID, yearID, readerUserID, "leadership")
	if err != nil {
		return domain.ObservationReader{}, err
	}
	return domain.ObservationReader{
		IsObserver: readerUserID == observerUserID, IsLeadership: leadership, IsObserved: readerUserID == teacherUserID,
	}, nil
}
