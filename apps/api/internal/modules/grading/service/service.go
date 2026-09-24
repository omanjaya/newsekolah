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
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
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
	DeleteGrade(ctx context.Context, tenantID, componentID, studentID uuid.UUID) error
	ListGradesForComponents(ctx context.Context, tenantID uuid.UUID, componentIDs []uuid.UUID) ([]domain.Grade, error)
	ListGradesForStudent(ctx context.Context, tenantID, studentID, termID uuid.UUID) ([]StudentGradeRow, error)

	SetPublication(ctx context.Context, tenantID, yearID, termID, classID, subjectID uuid.UUID, published bool, actorID uuid.UUID) (Publication, error)
	GetPublication(ctx context.Context, tenantID, termID, classID, subjectID uuid.UUID) (Publication, bool, error)
	ListPublishedSubjects(ctx context.Context, tenantID, termID, classID uuid.UUID) ([]uuid.UUID, error)

	// UpsertReportScore writes the freshly recomputed automatic value.
	// final_score becomes the manual override when one already exists (or
	// is set in the same call), otherwise it mirrors automatic -- see
	// domain.ComputeReportScore's doc comment for the full rule.
	UpsertReportScore(ctx context.Context, tenantID, yearID, termID, classID, subjectID, studentID uuid.UUID, previous, manual *float64, automatic float64) (ReportScore, error)
	SetManualReportScore(ctx context.Context, tenantID, yearID, termID, classID, subjectID, studentID uuid.UUID, manual *float64) (ReportScore, error)
	ListReportScores(ctx context.Context, tenantID, termID, classID, subjectID uuid.UUID) ([]ReportScore, error)
	ListReportScoresForStudent(ctx context.Context, tenantID, termID, studentID uuid.UUID) ([]ReportScore, error)

	ListGradeRanges(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.GradeRange, error)
	CreateGradeRange(ctx context.Context, tenantID, yearID uuid.UUID, r domain.GradeRange) (domain.GradeRange, error)
	DeleteGradeRange(ctx context.Context, tenantID, id uuid.UUID) error
	ReplaceGradeRanges(ctx context.Context, tenantID, yearID, subjectID uuid.UUID, teacherUserID uuid.NullUUID, ranges []domain.GradeRange) ([]domain.GradeRange, error)

	// TP mapping (e-Rapor legacy export).
	UpsertTPMapping(ctx context.Context, tenantID uuid.UUID, m domain.TPMapping) (domain.TPMapping, error)
	GetTPMapping(ctx context.Context, tenantID, id uuid.UUID) (domain.TPMapping, bool, error)
	ListTPMappingsForComponents(ctx context.Context, tenantID uuid.UUID, componentIDs []uuid.UUID) ([]domain.TPMapping, error)
	DeleteTPMapping(ctx context.Context, tenantID, id uuid.UUID) error

	InsertStarEvent(ctx context.Context, e domain.StarEvent) (domain.StarEvent, error)
	StarBalance(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (int, error)
	VisibleStarBalance(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (int, error)
	LockStarBalance(ctx context.Context, tenantID, studentID uuid.UUID) error
	ListStarEvents(ctx context.Context, tenantID, yearID, studentID uuid.UUID, includeHidden bool, limit int) ([]domain.StarEvent, error)
	ListStarBalances(ctx context.Context, tenantID, yearID, classID uuid.UUID) ([]StarBalance, error)
	MyStarsGrouped(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]MyStarGroup, error)

	ActiveTerm(ctx context.Context, tenantID, yearID uuid.UUID) (Term, bool, error)
	GetTerm(ctx context.Context, tenantID, termID uuid.UUID) (Term, bool, error)
	PreviousTermID(ctx context.Context, tenantID, yearID uuid.UUID, sequence int) (uuid.NullUUID, error)
	ClassStudentIDs(ctx context.Context, tenantID, yearID, classID uuid.UUID) ([]uuid.UUID, error)
	StudentClassID(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (uuid.NullUUID, error)
	TeacherTeaches(ctx context.Context, tenantID, yearID, teacherID, classID, subjectID uuid.UUID) (bool, error)
	TeacherTeachesClass(ctx context.Context, tenantID, yearID, teacherID, classID uuid.UUID) (bool, error)
	StudentNames(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error)
	ComponentHasGrades(ctx context.Context, tenantID, componentID uuid.UUID) (bool, error)

	// e-Rapor export.
	ListClassSubjects(ctx context.Context, tenantID, yearID, classID uuid.UUID) ([]EraporSubject, error)
	StudentNISNs(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]EraporStudent, error)

	GetLatestPolicy(ctx context.Context, tenantID uuid.UUID, kind string) ([]byte, int, bool, error)
	CreatePolicy(ctx context.Context, tenantID uuid.UUID, kind string, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error

	// Gradebook export's grade-level ("angkatan") scope.
	//
	// -- cross-module read; replace with academic reader interface after merge --
	GetClassName(ctx context.Context, tenantID, classID uuid.UUID) (string, error)
	GetGradeLevelName(ctx context.Context, tenantID, gradeLevelID uuid.UUID) (string, error)
	GetSubjectName(ctx context.Context, tenantID, subjectID uuid.UUID) (string, error)
	ListClassesByGradeLevel(ctx context.Context, tenantID, yearID, gradeLevelID uuid.UUID) ([]ClassRef, error)
	GetClassHomeroomTeacher(ctx context.Context, tenantID, classID uuid.UUID) (uuid.UUID, bool, error)
	GetUserName(ctx context.Context, tenantID, userID uuid.UUID) (string, error)
}

// ClassRef is a class's id and display name, the grade-level scope
// resolution needs for the gradebook export (one section per class).
//
// -- cross-module read; replace with academic reader interface after merge --
type ClassRef struct {
	ID   uuid.UUID
	Name string
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
	TermID         uuid.UUID
	ClassID        uuid.UUID
	SubjectID      uuid.UUID
	StudentUserID  uuid.UUID
	PreviousScore  *float64
	ManualScore    *float64
	AutomaticScore *float64
	FinalScore     float64
	ComputedAt     time.Time
}

type StarBalance struct {
	StudentUserID uuid.UUID
	Balance       int
}

// MyStarGroup is one subject-teacher bucket of a student's own star total,
// the shape the old app's my-stars screen showed (grading_extended.go:
// 640-669): visible events only, grouped by subject and teacher.
type MyStarGroup struct {
	SubjectID     uuid.NullUUID
	SubjectName   string
	TeacherUserID uuid.UUID
	TeacherName   string
	Total         int
	LastAwardedAt time.Time
}

// EraporSubject is one subject taught to a class, as read from the academic
// module for the e-Rapor export.
type EraporSubject struct {
	ID   uuid.UUID
	Code string
	Name string
}

// EraporStudent is the name, NIS and NISN e-Rapor needs to match a
// student, as read from the identity module. NIS is what the legacy
// per-subject sheet keys rows on; NISN is what the current export uses.
type EraporStudent struct {
	Name string
	NIS  string
	NISN string
}

type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
}

// FlagReader tells whether the grading module is switched on for a
// tenant, reading the platform console's existing feature-flag storage
// rather than a second flag system of its own (the same pattern billing
// and visitors already use).
type FlagReader interface {
	IsModuleEnabled(ctx context.Context, tenantID uuid.UUID) (bool, error)
}

type Service struct {
	pool  *pgxpool.Pool
	repo  Repository
	years AcademicYearReader
	flags FlagReader
	clock clock.Clock
	// letterheads is optional (set via SetLetterheadSource after
	// construction, mirroring attendance/scheduling's identically named
	// setter): nil means the gradebook export renders without a tenant
	// letterhead.
	letterheads reportdoc.LetterheadSource
}

func New(pool *pgxpool.Pool, repo Repository, years AcademicYearReader, flags FlagReader, clk clock.Clock) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, repo: repo, years: years, flags: flags, clock: clk}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// SetLetterheadSource wires the school module's tenant letterhead/default
// signature reader in after construction (cmd/api/wire.go, once the
// school module it depends on has itself been registered), for the
// gradebook export's Document.Letterhead/Signature.
func (s *Service) SetLetterheadSource(source reportdoc.LetterheadSource) {
	s.letterheads = source
}

// reportLetterhead loads tenantID's configured kop laporan and default
// signature, if any -- (nil, nil) when no letterheads source is wired or
// the tenant has not configured one, so a report renders without one
// rather than failing.
func (s *Service) reportLetterhead(ctx context.Context, tenantID uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error) {
	if s.letterheads == nil {
		return nil, nil, nil
	}
	return s.letterheads.Letterhead(ctx, tenantID)
}

// requireEnabled is the module's single enforcement point: every use case
// calls it first, so there is exactly one place that decides whether
// grading is on for a tenant (the same pattern billing and visitors use).
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
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Scale{}, err
	}
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
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Scale{}, err
	}
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
// Every gradebook read and write goes through this (grading.go:97-101's
// teacherOwnsGradingContext, restored here after the rebuild dropped it
// from a few read paths).
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

// requireTeachesClass is requireTeaches without a specific subject, for
// endpoints scoped to a whole class (the star ledger and class balances):
// the caller must teach the class in at least one subject.
func (s *Service) requireTeachesClass(ctx context.Context, tenantID, yearID, actorID, classID uuid.UUID, bypass bool) error {
	if bypass {
		return nil
	}
	ok, err := s.repo.TeacherTeachesClass(ctx, tenantID, yearID, actorID, classID)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrNotTeachingThisClass
	}
	return nil
}
