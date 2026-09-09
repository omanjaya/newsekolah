// Package service holds the grading use cases: assessment components and
// their scores, publication per class-subject, report scores computed from
// weighted averages, and the star ledger.
package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

const policyKindGradingScale = "grading"

type Term struct {
	ID             uuid.UUID
	AcademicYearID uuid.UUID
	Name           string
	Sequence       int
}

type Repository interface {
	ListComponents(ctx context.Context, tenantID, termID, classID, subjectID uuid.UUID) ([]domain.Component, error)
	GetComponent(ctx context.Context, tenantID, id uuid.UUID) (domain.Component, bool, error)
	CreateComponent(ctx context.Context, c domain.Component) (domain.Component, error)
	UpdateComponent(ctx context.Context, c domain.Component) (domain.Component, error)
	DeleteComponent(ctx context.Context, tenantID, id uuid.UUID) error

	UpsertGrade(ctx context.Context, tenantID, componentID, studentID uuid.UUID, score float64, recordedBy uuid.UUID) (domain.Grade, error)
	ListGradesForComponents(ctx context.Context, tenantID uuid.UUID, componentIDs []uuid.UUID) ([]domain.Grade, error)
	ListGradesForStudent(ctx context.Context, tenantID, studentID, termID uuid.UUID) ([]StudentGradeRow, error)

	SetPublication(ctx context.Context, tenantID, yearID, termID, classID, subjectID uuid.UUID, published bool, actorID uuid.UUID) (Publication, error)
	GetPublication(ctx context.Context, tenantID, termID, classID, subjectID uuid.UUID) (Publication, bool, error)
	ListPublishedSubjects(ctx context.Context, tenantID, termID, classID uuid.UUID) ([]uuid.UUID, error)

	UpsertReportScore(ctx context.Context, tenantID, yearID, termID, classID, subjectID, studentID uuid.UUID, previous, manual *float64, final float64) (ReportScore, error)
	SetManualReportScore(ctx context.Context, tenantID, yearID, termID, classID, subjectID, studentID uuid.UUID, manual *float64) (ReportScore, error)
	ListReportScores(ctx context.Context, tenantID, termID, classID, subjectID uuid.UUID) ([]ReportScore, error)
	ListReportScoresForStudent(ctx context.Context, tenantID, termID, studentID uuid.UUID) ([]ReportScore, error)

	ListGradeRanges(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.GradeRange, error)
	CreateGradeRange(ctx context.Context, tenantID, yearID uuid.UUID, r domain.GradeRange) (domain.GradeRange, error)
	DeleteGradeRange(ctx context.Context, tenantID, id uuid.UUID) error

	InsertStarEvent(ctx context.Context, e domain.StarEvent) (domain.StarEvent, error)
	StarBalance(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (int, error)
	ListStarEvents(ctx context.Context, tenantID, yearID, studentID uuid.UUID, includeHidden bool, limit int) ([]domain.StarEvent, error)
	ListStarBalances(ctx context.Context, tenantID, yearID, classID uuid.UUID) ([]StarBalance, error)

	ActiveTerm(ctx context.Context, tenantID, yearID uuid.UUID) (Term, bool, error)
	GetTerm(ctx context.Context, tenantID, termID uuid.UUID) (Term, bool, error)
	PreviousTermID(ctx context.Context, tenantID, yearID uuid.UUID, sequence int) (uuid.NullUUID, error)
	ClassStudentIDs(ctx context.Context, tenantID, yearID, classID uuid.UUID) ([]uuid.UUID, error)
	StudentClassID(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (uuid.NullUUID, error)
	TeacherTeaches(ctx context.Context, tenantID, yearID, teacherID, classID, subjectID uuid.UUID) (bool, error)
	StudentNames(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error)

	GetLatestPolicy(ctx context.Context, tenantID uuid.UUID, kind string) ([]byte, int, bool, error)
	CreatePolicy(ctx context.Context, tenantID uuid.UUID, kind string, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error
}

type StudentGradeRow struct {
	ComponentID uuid.UUID
	Code        string
	Kind        domain.ComponentKind
	Weight      float64
	KKTP        *float64
	SubjectID   uuid.UUID
	ClassID     uuid.UUID
	TermID      uuid.UUID
	Score       float64
	UpdatedAt   time.Time
}

type Publication struct {
	TermID      uuid.UUID
	ClassID     uuid.UUID
	SubjectID   uuid.UUID
	IsPublished bool
	PublishedAt *time.Time
}

type ReportScore struct {
	TermID        uuid.UUID
	ClassID       uuid.UUID
	SubjectID     uuid.UUID
	StudentUserID uuid.UUID
	PreviousScore *float64
	ManualScore   *float64
	FinalScore    float64
	ComputedAt    time.Time
}

type StarBalance struct {
	StudentUserID uuid.UUID
	Balance       int
}

type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
}

type Service struct {
	pool  *pgxpool.Pool
	repo  Repository
	years AcademicYearReader
	clock clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository, years AcademicYearReader, clk clock.Clock) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, repo: repo, years: years, clock: clk}
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

// resolveTerm returns the requested term, or the active one when the
// caller passed none.
func (s *Service) resolveTerm(ctx context.Context, tenantID, yearID uuid.UUID, termID uuid.NullUUID) (Term, error) {
	if termID.Valid {
		term, ok, err := s.repo.GetTerm(ctx, tenantID, termID.UUID)
		if err != nil {
			return Term{}, err
		}
		if !ok {
			return Term{}, domain.ErrNoActiveTerm
		}
		return term, nil
	}
	term, ok, err := s.repo.ActiveTerm(ctx, tenantID, yearID)
	if err != nil {
		return Term{}, err
	}
	if !ok {
		return Term{}, domain.ErrNoActiveTerm
	}
	return term, nil
}

// Scale returns the tenant's grading scale, seeding the default on first read.
func (s *Service) Scale(ctx context.Context, tenantID uuid.UUID) (domain.Scale, error) {
	var scale domain.Scale
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		scale, err = s.loadScale(ctx, tenantID)
		return err
	})
	return scale, err
}

func (s *Service) loadScale(ctx context.Context, tenantID uuid.UUID) (domain.Scale, error) {
	raw, version, found, err := s.repo.GetLatestPolicy(ctx, tenantID, policyKindGradingScale)
	if err != nil {
		return domain.Scale{}, err
	}
	if !found {
		def := domain.DefaultScale()
		encoded, err := json.Marshal(def)
		if err != nil {
			return domain.Scale{}, err
		}
		if err := s.repo.CreatePolicy(ctx, tenantID, policyKindGradingScale, def.Version, encoded, s.clock.Now(), uuid.NullUUID{}); err != nil {
			return domain.Scale{}, err
		}
		return def, nil
	}
	var scale domain.Scale
	if err := json.Unmarshal(raw, &scale); err != nil {
		return domain.Scale{}, err
	}
	scale.Version = version
	return scale, nil
}

func (s *Service) UpdateScale(ctx context.Context, tenantID, actorID uuid.UUID, next domain.Scale) (domain.Scale, error) {
	if err := next.Validate(); err != nil {
		return domain.Scale{}, err
	}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, err := s.loadScale(ctx, tenantID)
		if err != nil {
			return err
		}
		next.Version = current.Version + 1
		encoded, err := json.Marshal(next)
		if err != nil {
			return err
		}
		return s.repo.CreatePolicy(ctx, tenantID, policyKindGradingScale, next.Version, encoded, s.clock.Now(), uuid.NullUUID{UUID: actorID, Valid: true})
	})
	return next, err
}

// requireTeaches lets the assigned teacher, and anyone with the
// manage-grades permission the transport already checked, write grades.
func (s *Service) requireTeaches(ctx context.Context, tenantID, yearID, actorID, classID, subjectID uuid.UUID, bypass bool) error {
	if bypass {
		return nil
	}
	ok, err := s.repo.TeacherTeaches(ctx, tenantID, yearID, actorID, classID, subjectID)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrNotTeachingThisClass
	}
	return nil
}
