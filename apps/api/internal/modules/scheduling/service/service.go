// Package service implements scheduling's use cases: schedule CRUD with
// conflict detection, substitution request workflow, and class journals. It
// orchestrates domain rules and the Repository; it holds no SQL and no HTTP
// concerns, per docs/03-layered-architecture.md section 1.
package service

import (
	"context"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// PeriodRef is a period read from the academic module's tables (owned by
// the academic module; read here as a cross-module read per this module's
// brief, replaced by a real academic.PeriodReader interface after merge).
type PeriodRef struct {
	ID         uuid.UUID
	Sequence   int16
	StartsAt   time.Time // wall-clock time-of-day, date component is meaningless
	EndsAt     time.Time
	TemplateID uuid.UUID
}

// ClassRef and SubjectRef are the minimal academic facts scheduling needs
// to validate a request and to build conflict-error details.
type ClassRef struct {
	ID                uuid.UUID
	Name              string
	HomeroomTeacherID uuid.NullUUID
}

type SubjectRef struct {
	ID   uuid.UUID
	Code string
	Name string
}

// SubstituteCandidate is one row of the eligible-substitutes picker: an
// active teacher this academic year, other than the requester.
type SubstituteCandidate struct {
	UserID uuid.UUID
	Name   string
}

// Repository is scheduling's data-access boundary, declared here (the
// consumer) per docs/03-layered-architecture.md section 1. The
// AcademicRead* methods read tables owned by the academic module; see the
// comment on internal/modules/scheduling/queries/academic_reads.sql.
type Repository interface {
	CreateSchedule(ctx context.Context, s domain.Schedule) (domain.Schedule, error)
	UpdateSchedule(ctx context.Context, s domain.Schedule) (domain.Schedule, error)
	GetScheduleByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Schedule, error)
	DeleteSchedule(ctx context.Context, tenantID, id uuid.UUID) error
	DeleteSchedulesByAcademicYear(ctx context.Context, tenantID, academicYearID uuid.UUID) error
	ListSchedulesByAcademicYear(ctx context.Context, tenantID, academicYearID uuid.UUID) ([]domain.Schedule, error)
	ListSchedulesByClass(ctx context.Context, tenantID, academicYearID, classID uuid.UUID) ([]domain.Schedule, error)
	ListSchedulesByTeacher(ctx context.Context, tenantID, academicYearID, teacherID uuid.UUID) ([]domain.Schedule, error)
	ListSchedulesByDay(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16) ([]domain.Schedule, error)
	CountSchedulesForClassDay(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, dayOfWeek int16) (int64, error)

	CreateSubstitution(ctx context.Context, s domain.Substitution) (domain.Substitution, error)
	GetSubstitutionByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Substitution, error)
	GetActiveSubstitutionForScheduleDate(ctx context.Context, tenantID, scheduleID uuid.UUID, date time.Time) (domain.Substitution, bool, error)
	GetAcceptedSubstitutionForScheduleDate(ctx context.Context, tenantID, scheduleID, substituteUserID uuid.UUID, date time.Time) (domain.Substitution, bool, error)
	RespondSubstitution(ctx context.Context, tenantID, id uuid.UUID, status domain.SubstitutionStatus, note string) (domain.Substitution, error)
	CancelSubstitution(ctx context.Context, tenantID, id uuid.UUID) (domain.Substitution, error)
	ListSubstitutionsIncoming(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Substitution, error)
	ListSubstitutionsOutgoing(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Substitution, error)
	ListAcceptedSubstitutionsForSubstituteDate(ctx context.Context, tenantID, substituteUserID uuid.UUID, date time.Time) ([]domain.Substitution, error)
	// ListSubstitutionsAll is the manage_schedules-only "all" list scope;
	// status filters to one status when non-nil.
	ListSubstitutionsAll(ctx context.Context, tenantID uuid.UUID, status *domain.SubstitutionStatus) ([]domain.Substitution, error)
	// ListEligibleSubstituteTeachers backs the substitute picker: active
	// teachers this academic year, excluding excludeUserID, with an
	// optional name search.
	ListEligibleSubstituteTeachers(ctx context.Context, tenantID, academicYearID, excludeUserID uuid.UUID, search string, limit, offset int) ([]SubstituteCandidate, error)

	CreateJournal(ctx context.Context, j domain.Journal) (domain.Journal, error)
	UpdateJournal(ctx context.Context, j domain.Journal) (domain.Journal, error)
	GetJournalByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Journal, error)
	GetJournalByUnique(ctx context.Context, tenantID, academicYearID, teacherID, classID, subjectID uuid.UUID, lessonDate time.Time) (domain.Journal, bool, error)
	ListJournalsFiltered(ctx context.Context, tenantID, academicYearID uuid.UUID, f JournalFilter) ([]domain.Journal, error)
	CountJournalsFiltered(ctx context.Context, tenantID, academicYearID uuid.UUID, f JournalFilter) (int64, error)
	DeleteJournal(ctx context.Context, tenantID, id uuid.UUID) error

	// -- cross-module read; replace with academic reader interface after merge --
	GetClassRef(ctx context.Context, tenantID, classID uuid.UUID) (ClassRef, error)
	GetSubjectRef(ctx context.Context, tenantID, subjectID uuid.UUID) (SubjectRef, error)
	GetPeriodRef(ctx context.Context, tenantID, periodID uuid.UUID) (PeriodRef, error)
	ListPeriodsByTemplate(ctx context.Context, tenantID, templateID uuid.UUID) ([]PeriodRef, error)
	GetPeriodTemplateForDay(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16) (uuid.UUID, error)
	IsSchoolDay(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16) (bool, error)
	HasTeachingAssignment(ctx context.Context, tenantID, academicYearID, teacherID, subjectID, classID uuid.UUID) (bool, error)
	IsActiveTeacher(ctx context.Context, tenantID, academicYearID, userID uuid.UUID) (bool, error)
	ListActiveEnrollments(ctx context.Context, tenantID, academicYearID, classID uuid.UUID) ([]uuid.UUID, error)
	GetUserName(ctx context.Context, tenantID, userID uuid.UUID) (string, error)

	GetTenantSettingValue(ctx context.Context, tenantID uuid.UUID, key string) (string, bool, error)
}

type Service struct {
	pool  *pgxpool.Pool
	repo  Repository
	clock clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository) *Service {
	return &Service{pool: pool, repo: repo, clock: clock.Real{}}
}

// WithClock swaps the clock; tests use it to pin "now".
func (s *Service) WithClock(c clock.Clock) *Service {
	s.clock = c
	return s
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}
