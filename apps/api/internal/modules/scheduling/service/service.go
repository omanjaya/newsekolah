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
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// PeriodRef is a period read from the academic module's tables (owned by
// the academic module; read here as a cross-module read per this module's
// brief, replaced by a real academic.PeriodReader interface after merge).
type PeriodRef struct {
	ID         uuid.UUID
	Name       string
	Sequence   int16
	StartsAt   time.Time // wall-clock time-of-day, date component is meaningless
	EndsAt     time.Time
	TemplateID uuid.UUID
	IsBreak    bool
}

// AcademicYearRef is the date span of an academic year, which bounds the
// effective dates of its schedule versions.
type AcademicYearRef struct {
	StartsOn time.Time
	EndsOn   time.Time
	Archived bool
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

// UserRef is the minimal identity fact scheduling needs to name a user in
// a conflict error (the teacher a class or teacher conflict is with).
type UserRef struct {
	ID   uuid.UUID
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
	// RetireSchedule ends one version on until (its last lesson date).
	RetireSchedule(ctx context.Context, tenantID, id uuid.UUID, until time.Time, updatedBy uuid.NullUUID) (domain.Schedule, error)
	DeleteSchedulesByAcademicYear(ctx context.Context, tenantID, academicYearID uuid.UUID) error
	// ListSchedulesByAcademicYear returns every version of the year,
	// locked FOR UPDATE.
	ListSchedulesByAcademicYear(ctx context.Context, tenantID, academicYearID uuid.UUID) ([]domain.Schedule, error)
	// ListSchedulesByClassForWeek and ListSchedulesByTeacherForWeek return,
	// for each weekday of the week starting weekStart, the versions in
	// effect on that weekday's date.
	ListSchedulesByClassForWeek(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, weekStart time.Time) ([]domain.Schedule, error)
	ListSchedulesByTeacherForWeek(ctx context.Context, tenantID, academicYearID, teacherID uuid.UUID, weekStart time.Time) ([]domain.Schedule, error)
	// ListSchedulesByDayOn returns every class's versions in effect on date.
	ListSchedulesByDayOn(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16, date time.Time) ([]domain.Schedule, error)
	// ListSchedulesByDay returns every version of one weekday, whatever
	// its dates, for the conflict check.
	ListSchedulesByDay(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16) ([]domain.Schedule, error)
	// ListSchedulesForTeacherOn returns a teacher's versions in effect on date.
	ListSchedulesForTeacherOn(ctx context.Context, tenantID, academicYearID, teacherID uuid.UUID, date time.Time) ([]domain.Schedule, error)
	CountSchedulesForClassOn(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, date time.Time) (int64, error)
	// ListScheduleHistory returns which of ids have history (a recorded
	// attendance session, a substitution request or a supervision visit)
	// and the last date it binds.
	ListScheduleHistory(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) ([]domain.History, error)
	CountSchedulesByClassDates(ctx context.Context, tenantID, academicYearID uuid.UUID, classIDs []uuid.UUID, dates []time.Time) ([]ClassDateCount, error)

	CreateSubstitution(ctx context.Context, s domain.Substitution) (domain.Substitution, error)
	GetSubstitutionByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Substitution, error)
	GetActiveSubstitutionForScheduleDate(ctx context.Context, tenantID, scheduleID uuid.UUID, date time.Time) (domain.Substitution, bool, error)
	GetAcceptedSubstitutionForScheduleDate(ctx context.Context, tenantID, scheduleID, substituteUserID uuid.UUID, date time.Time) (domain.Substitution, bool, error)
	RespondSubstitution(ctx context.Context, tenantID, id uuid.UUID, status domain.SubstitutionStatus, note string) (domain.Substitution, error)
	CancelSubstitution(ctx context.Context, tenantID, id uuid.UUID) (domain.Substitution, error)
	ListSubstitutionsIncoming(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Substitution, error)
	ListSubstitutionsOutgoing(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Substitution, error)
	// ListSubstitutionsIncomingWithSchedule/ListSubstitutionsOutgoingWithSchedule
	// are the above two, each row enriched with the class/subject/period it
	// covers -- see domain.SubstitutionWithSchedule.
	ListSubstitutionsIncomingWithSchedule(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.SubstitutionWithSchedule, error)
	ListSubstitutionsOutgoingWithSchedule(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.SubstitutionWithSchedule, error)
	ListAcceptedSubstitutionsForSubstituteDate(ctx context.Context, tenantID, substituteUserID uuid.UUID, date time.Time) ([]domain.Substitution, error)
	ListAcceptedSubstitutionsForRequesterDate(ctx context.Context, tenantID, requesterUserID uuid.UUID, date time.Time) ([]domain.Substitution, error)
	// ListSubstitutionsAll is the manage_schedules-only "all" list scope;
	// status filters to one status when non-nil.
	ListSubstitutionsAll(ctx context.Context, tenantID uuid.UUID, status *domain.SubstitutionStatus) ([]domain.SubstitutionWithSchedule, error)
	// ListEligibleSubstituteTeachers backs the substitute picker: active
	// teachers this academic year, excluding excludeUserID, with an
	// optional name search.
	ListEligibleSubstituteTeachers(ctx context.Context, tenantID, academicYearID, excludeUserID uuid.UUID, search string, limit, offset int) ([]SubstituteCandidate, error)

	CreateJournal(ctx context.Context, j domain.Journal) (domain.Journal, error)
	UpdateJournal(ctx context.Context, j domain.Journal) (domain.Journal, error)
	UpsertJournal(ctx context.Context, j domain.Journal) (domain.Journal, error)
	GetLatestJournalForClassSubjectBeforeDate(ctx context.Context, tenantID, academicYearID, classID, subjectID uuid.UUID, before time.Time) (domain.Journal, bool, error)
	GetJournalByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Journal, error)
	GetJournalByUnique(ctx context.Context, tenantID, academicYearID, teacherID, classID, subjectID uuid.UUID, lessonDate time.Time) (domain.Journal, bool, error)
	ListJournalsFiltered(ctx context.Context, tenantID, academicYearID uuid.UUID, f JournalFilter) ([]domain.Journal, error)
	CountJournalsFiltered(ctx context.Context, tenantID, academicYearID uuid.UUID, f JournalFilter) (int64, error)
	DeleteJournal(ctx context.Context, tenantID, id uuid.UUID) error

	// -- cross-module read; replace with academic reader interface after merge --
	GetClassRef(ctx context.Context, tenantID, classID uuid.UUID) (ClassRef, error)
	// GetClassHomeroomTeacher resolves one class's currently assigned
	// homeroom teacher, if any, for the journal export's "Wali Kelas"
	// signer.
	GetClassHomeroomTeacher(ctx context.Context, tenantID, classID uuid.UUID) (teacherUserID uuid.UUID, ok bool, err error)
	GetSubjectRef(ctx context.Context, tenantID, subjectID uuid.UUID) (SubjectRef, error)
	GetUserRef(ctx context.Context, tenantID, userID uuid.UUID) (UserRef, error)
	GetPeriodRef(ctx context.Context, tenantID, periodID uuid.UUID) (PeriodRef, error)
	ListPeriodsByTemplate(ctx context.Context, tenantID, templateID uuid.UUID) ([]PeriodRef, error)
	GetPeriodTemplateForDay(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16) (uuid.UUID, error)
	IsSchoolDay(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16) (bool, error)
	IsYearArchived(ctx context.Context, tenantID, academicYearID uuid.UUID) (bool, error)
	GetAcademicYearRef(ctx context.Context, tenantID, academicYearID uuid.UUID) (AcademicYearRef, error)
	HasTeachingAssignment(ctx context.Context, tenantID, academicYearID, teacherID, subjectID, classID uuid.UUID) (bool, error)
	IsActiveTeacher(ctx context.Context, tenantID, academicYearID, userID uuid.UUID) (bool, error)
	GetStudentActiveClassID(ctx context.Context, tenantID, academicYearID, studentID uuid.UUID) (uuid.UUID, bool, error)
	ListActiveEnrollments(ctx context.Context, tenantID, academicYearID, classID uuid.UUID) ([]uuid.UUID, error)
	ListTeacherOptions(ctx context.Context, tenantID, academicYearID uuid.UUID, search string, selfUserID uuid.NullUUID, limit int32) ([]UserRef, error)
	GetUserName(ctx context.Context, tenantID, userID uuid.UUID) (string, error)

	GetTenantSettingValue(ctx context.Context, tenantID uuid.UUID, key string) (string, bool, error)
}

type Service struct {
	pool  *pgxpool.Pool
	repo  Repository
	clock clock.Clock
	// letterheads is optional (set via SetLetterheadSource after
	// construction, mirroring attendance/service.Service's identically
	// named setter): nil means every report export renders without a
	// tenant letterhead, same as before reportdoc.LetterheadSource
	// existed.
	letterheads reportdoc.LetterheadSource
	// calendar is optional (set via SetCalendar): nil skips the holiday
	// check on substitution requests, leaving only the weekly pattern.
	calendar ClassCalendar
}

// ClassCalendar answers whether a dated lesson of one class actually takes
// place: the weekly pattern plus the academic calendar's holidays,
// no-school days and semester breaks scoped to the class's grade level.
// eventName names the non-teaching event when there is one. Implemented in
// internal/wiring over the academic module, per
// docs/03-layered-architecture.md section 1.
type ClassCalendar interface {
	IsTeachingDay(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, date time.Time) (teaching bool, eventName string, err error)
}

// SetCalendar wires the academic calendar in after construction.
func (s *Service) SetCalendar(c ClassCalendar) {
	s.calendar = c
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

// SetLetterheadSource wires the school module's tenant letterhead/default
// signature reader in after construction (cmd/api/wire.go, once the
// school module it depends on has itself been registered), for the
// journal export's Document.Letterhead/Signature.
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
