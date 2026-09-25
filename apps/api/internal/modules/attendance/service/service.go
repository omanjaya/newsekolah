// Package service implements attendance's use cases: opening a session,
// recording and correcting entries, materializing the daily summary, the
// student calendar and homeroom views, reports, and the monitor snapshot.
// It orchestrates domain rules and the Repository; it holds no SQL and no
// HTTP concerns, per docs/03-layered-architecture.md section 1.
package service

import (
	"context"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	scheduling "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// StudentRef is the minimal academic fact attendance needs about an
// enrolled student: enough to build a session roster or a report row,
// without importing the academic module's own richer type.
//
// -- cross-module read; replace with academic reader interface after merge --
type StudentRef struct {
	ID            uuid.UUID
	Name          string
	NIS           string
	GuardianName  string
	GuardianPhone string
}

// ClassRef is a class's id and display name, the grade-level scope
// resolution needs for report exports (one section per class).
//
// -- cross-module read; replace with academic reader interface after merge --
type ClassRef struct {
	ID   uuid.UUID
	Name string
}

// DailySummaryRow is one attendance_daily_summary row as the service reads
// and writes it -- the materialized result of domain.ComputeDailyStatus.
type DailySummaryRow struct {
	StudentUserID     uuid.UUID
	Date              time.Time
	StatusCode        string
	ExpectedSessions  int
	SubmittedSessions int
	PartialAbsence    bool
}

// SessionDetailRow is one session's subject/teacher/period names, the raw
// input to a DailyReportSession row (its per-student Entries are read
// separately, via ListEntriesBySession).
//
// -- cross-module read; replace with academic/identity reader interface after merge --
type SessionDetailRow struct {
	SessionID       uuid.UUID
	ClassID         uuid.UUID
	ClassName       string
	SubjectID       uuid.UUID
	SubjectName     string
	TeacherUserID   uuid.UUID
	TeacherName     string
	StartPeriodName string
	EndPeriodName   string
	SubmittedAt     *time.Time
}

// MonitorCardRow is one schedule occurrence currently in its period, the
// raw input to a MonitorSessionCard.
//
// -- cross-module read; replace with academic reader interface after merge --
type MonitorCardRow struct {
	ClassID       uuid.UUID
	ClassName     string
	SubjectID     uuid.UUID
	SubjectName   string
	TeacherUserID uuid.UUID
	TeacherName   string
	SessionOpen   bool
	Submitted     bool
	// SubstituteName is set when a substitute teacher (not TeacherName,
	// the schedule's regular teacher) actually took today's session.
	SubstituteName string
	// PeriodName/PeriodStartsAt/PeriodEndsAt are the governing period's
	// own identity: every card on one snapshot shares the same period
	// (they all resolved against the same now_time), so the monitor's
	// "current period" banner is this period.
	PeriodName     string
	PeriodStartsAt time.Time
	PeriodEndsAt   time.Time
}

// NoScheduleClassRow is one class with nothing scheduled in the period
// currently running, for the monitor snapshot's "no schedule" cards.
type NoScheduleClassRow struct {
	ClassID   uuid.UUID
	ClassName string
}

// Repository is attendance's data-access boundary, declared here (the
// consumer) per docs/03-layered-architecture.md section 1.
type Repository interface {
	// OpenSession inserts a session, returning created=false and the
	// existing row when (schedule_id, date) already has one (the ON
	// CONFLICT DO NOTHING in queries/sessions.sql).
	OpenSession(ctx context.Context, s domain.Session) (session domain.Session, created bool, err error)
	GetSessionByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Session, error)
	GetSessionBySchedule(ctx context.Context, tenantID, scheduleID uuid.UUID, date time.Time) (session domain.Session, found bool, err error)
	SubmitSession(ctx context.Context, tenantID, id, submittedBy uuid.UUID, notes string) (domain.Session, error)
	ListSessionsByClassDate(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) ([]domain.Session, error)
	ListSessionsByTeacherDate(ctx context.Context, tenantID uuid.UUID, date time.Time, teacherUserID uuid.UUID) ([]domain.Session, error)
	ListSessionsByDateRange(ctx context.Context, tenantID, academicYearID uuid.UUID, from, to time.Time) ([]domain.Session, error)
	CountSubmittedSessionsByClassDate(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) (int64, error)
	// CountSessionsBeforeDate and GetLatestSessionBeforeDate back
	// buildSessionDetail's meeting_number and previous_journal_topic.
	CountSessionsBeforeDate(ctx context.Context, tenantID, scheduleID uuid.UUID, date time.Time) (int64, error)
	GetLatestSessionBeforeDate(ctx context.Context, tenantID, scheduleID uuid.UUID, date time.Time) (session domain.Session, found bool, err error)

	UpsertEntry(ctx context.Context, e domain.Entry) (domain.Entry, error)
	ListEntriesBySession(ctx context.Context, tenantID, sessionID uuid.UUID) ([]domain.Entry, error)
	GetEntryBySessionStudent(ctx context.Context, tenantID, sessionID, studentUserID uuid.UUID) (entry domain.Entry, found bool, err error)
	ListEntryStatusesForStudentDate(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) ([]string, error)
	GetPreviousEntryForStudent(ctx context.Context, tenantID, studentUserID, classID, subjectID uuid.UUID, before time.Time) (status string, found bool, err error)
	// CountEntryStatusesForStudentsInYear backs the roster's per-student
	// "N Sakit, N Izin, ..." recap (buildSessionDetail): one batched
	// aggregate for the whole roster rather than one query per student.
	CountEntryStatusesForStudentsInYear(ctx context.Context, tenantID, academicYearID uuid.UUID, studentUserIDs []uuid.UUID) ([]domain.StudentStatusCount, error)

	CreateCorrection(ctx context.Context, c domain.Correction) (domain.Correction, error)

	UpsertDailySummary(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID, date time.Time, statusCode string, expected, submitted int, partialAbsence bool) error
	GetDailySummary(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID, date time.Time) (row DailySummaryRow, found bool, err error)
	ListDailySummaryForStudentMonth(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID, from, to time.Time) ([]DailySummaryRow, error)
	ListDailySummaryForClassDate(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, date time.Time) ([]DailySummaryRow, error)
	CountDailySummaryStatuses(ctx context.Context, tenantID, academicYearID uuid.UUID, date time.Time) (map[string]int, error)

	// GetLatestPolicy returns the tenant's most recently effective policy
	// of kind (raw JSON config plus its version), or found=false if the
	// tenant has never configured one -- the caller falls back to
	// domain.DefaultStatusPolicy.
	GetLatestPolicy(ctx context.Context, tenantID uuid.UUID, kind string) (config []byte, version int, found bool, err error)
	CreatePolicy(ctx context.Context, tenantID uuid.UUID, kind string, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error

	// -- cross-module read; replace with academic/identity reader interface after merge --
	ListActiveEnrollments(ctx context.Context, tenantID, academicYearID, classID uuid.UUID) ([]StudentRef, error)
	GetEnrolledClass(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID) (classID uuid.UUID, ok bool, err error)
	GetHomeroomClassForTeacher(ctx context.Context, tenantID, academicYearID, teacherUserID uuid.UUID) (classID uuid.UUID, ok bool, err error)
	GetTenantTimezone(ctx context.Context, tenantID uuid.UUID) (string, error)
	// GetClassName resolves one class's display name, for the class scope
	// of a report export's Section name.
	//
	// -- cross-module read; replace with academic reader interface after merge --
	GetClassName(ctx context.Context, tenantID, classID uuid.UUID) (string, error)
	// GetClassHomeroomTeacher resolves one class's currently assigned
	// homeroom teacher, if any, for a report export's "Wali Kelas" signer.
	//
	// -- cross-module read; replace with academic reader interface after merge --
	GetClassHomeroomTeacher(ctx context.Context, tenantID, classID uuid.UUID) (teacherUserID uuid.UUID, ok bool, err error)
	// GetGradeLevelName resolves one grade level's display name, for the
	// grade-level scope of a report export's scope line.
	//
	// -- cross-module read; replace with academic reader interface after merge --
	GetGradeLevelName(ctx context.Context, tenantID, gradeLevelID uuid.UUID) (string, error)
	// ListClassesByGradeLevel resolves the grade-level ("angkatan") scope
	// for a report export: every class of the academic year under
	// gradeLevelID, ordered by name.
	//
	// -- cross-module read; replace with academic reader interface after merge --
	ListClassesByGradeLevel(ctx context.Context, tenantID, academicYearID, gradeLevelID uuid.UUID) ([]ClassRef, error)
	ListCurrentPeriodScheduleCards(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16, date, nowLocal time.Time) ([]MonitorCardRow, error)
	// ListClassesWithoutCurrentSchedule backs the monitor snapshot's
	// "no schedule" cards: classes that exist but have nothing scheduled
	// in the period straddling nowLocal.
	ListClassesWithoutCurrentSchedule(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16, nowLocal time.Time) ([]NoScheduleClassRow, error)
	GetMonitorDisplayToken(ctx context.Context, tenantID uuid.UUID) (token string, configured bool, err error)
	GetCorrectionDays(ctx context.Context, tenantID uuid.UUID) (days int, configured bool, err error)

	// IsSchoolDay and GetPeriodEndTime read two more academic-module tables
	// attendance needs but ScheduleReader does not expose: whether a
	// weekday is one the tenant actually holds school on (school_days is a
	// weekly pattern, not a full holiday calendar, so "expected sessions"
	// below is scoped to that pattern rather than a true holiday-aware
	// count), and a period's end-of-day wall-clock time (for the save
	// window).
	//
	// -- cross-module read; replace with academic reader interface after merge --
	IsSchoolDay(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16) (bool, error)
	GetPeriodEndTime(ctx context.Context, tenantID, periodID uuid.UUID) (time.Duration, error)
	GetPeriodStartTime(ctx context.Context, tenantID, periodID uuid.UUID) (time.Duration, error)

	// ListSessionDetailsForClassDate and ListOwnSubmittedSessionDetails
	// back the daily report's per-session rows and the "own sessions"
	// scope respectively -- both cross-module reads for the same reason
	// as ListCurrentPeriodScheduleCards above.
	ListSessionDetailsForClassDate(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) ([]SessionDetailRow, error)
	ListOwnSubmittedSessionDetails(ctx context.Context, tenantID, teacherUserID uuid.UUID, date time.Time) ([]SessionDetailRow, error)
	// GetUserName resolves a display name for a session-detail row's
	// students, since ListEntriesBySession returns only IDs.
	//
	// -- cross-module read; replace with identity reader interface after merge --
	GetUserName(ctx context.Context, tenantID, userID uuid.UUID) (string, error)
}

// AcademicYearReader is the narrow interface attendance needs from the
// school module: every attendance view (calendar, homeroom, monitor) is
// scoped to the tenant's currently active academic year, since the OpenAPI
// contract never asks the caller to name one explicitly. Mirrors
// identity/service.AcademicYearReader's pattern.
type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
}

// EventPublisher is the narrow slice of platform/events.Bus the service
// needs, mirroring scheduling/service.EventPublisher's rationale for
// redeclaring Event locally instead of importing platform/events for more
// than this one interface at the module.go wiring boundary.
type EventPublisher interface {
	Publish(ctx context.Context, evt Event) error
}

type Event interface {
	EventName() string
}

// Blocker and Overrider mirror the attendance package's exported
// extension-point interfaces (extensions.go) structurally, rather than
// importing that package directly: module.go (which does import it, to
// build the wiring) would otherwise create an import cycle, since it also
// imports this package to construct the Service.
type Blocker interface {
	IsBlocked(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (blocked bool, reason string, err error)
}

type Overrider interface {
	Override(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (statusCode string, source domain.EntrySource, ok bool, err error)
}

// ViolationRecorder lets SaveEntries record a session's per-student
// discipline violations through the discipline module without this
// package importing it, mirroring Blocker/Overrider's rationale.
// violationTypeIDs replaces whatever was previously recorded against
// (sessionID, studentUserID), per docs/analysis/backend-inventory.md
// section 1.9's delete-then-reinsert rule.
type ViolationRecorder interface {
	ReplaceSessionViolations(ctx context.Context, tenantID, sessionID, studentUserID uuid.UUID, violationTypeIDs []uuid.UUID, occurredOn time.Time, reporterUserID uuid.UUID) error
}

// DisciplineReader lets the homeroom roster show each student's violation
// count and total points without this package importing discipline.
type DisciplineReader interface {
	ViolationSummary(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID) (count, points int, err error)

	// ViolationSummaryForClass is ViolationSummary for every student
	// currently enrolled in one class at once, keyed by student user ID. A
	// student with no violations is simply absent from the map rather than
	// present with a zero entry. The homeroom roster (calendar.go's
	// GetHomeroomAttendance) uses this instead of calling ViolationSummary
	// once per student, which was one query per roster row.
	ViolationSummaryForClass(ctx context.Context, tenantID, classID uuid.UUID) (map[uuid.UUID]ViolationSummary, error)
}

// ViolationSummary is one student's violation count and total points, as
// returned in bulk by DisciplineReader.ViolationSummaryForClass.
type ViolationSummary struct {
	Count  int
	Points int
}

// RealtimePublisher lets the service push a live update to the monitor
// display's WebSocket topic after a session is submitted, without this
// package importing platform/realtime for anything but this one method
// (the hub's topic-naming convention -- "monitor:<tenantID>" -- is owned by
// cmd/api/ws.go, which module.go's adapter mirrors at the wiring boundary).
type RealtimePublisher interface {
	PublishMonitor(tenantID uuid.UUID, event any) error
}

// PresenceReader backs GetMonitorPresence: an adapter over
// platform/realtime's Presence (if the caller wires one in) or, absent
// that, a plain count of open sockets on the monitor topic. Kept as an
// interface for the same reason RealtimePublisher is: this package must
// not import platform/realtime for anything but this one call shape.
type PresenceReader interface {
	Snapshot(tenantID uuid.UUID) (count int, keys []string)
}

// Service implements attendance's use cases.
type Service struct {
	pool       *pgxpool.Pool
	repo       Repository
	years      AcademicYearReader
	schedules  scheduling.ScheduleReader
	access     scheduling.AccessChecker
	journals   scheduling.JournalService
	blocker    Blocker
	overrider  Overrider
	violations ViolationRecorder
	discipline DisciplineReader
	events     EventPublisher
	realtime   RealtimePublisher
	presence   PresenceReader
	clock      clock.Clock
	// letterheads is optional (set via SetLetterheadSource after
	// construction, mirroring school/service.Service's
	// SetOnboardingDependencies pattern for a dependency other modules
	// wire in late): nil means no tenant has a configured kop laporan
	// yet available to this module, so every report export renders
	// without one, same as before reportdoc.LetterheadSource existed.
	letterheads reportdoc.LetterheadSource
}

func New(
	pool *pgxpool.Pool, repo Repository, years AcademicYearReader,
	schedules scheduling.ScheduleReader, access scheduling.AccessChecker, journals scheduling.JournalService,
	blocker Blocker, overrider Overrider, violations ViolationRecorder, discipline DisciplineReader,
	events EventPublisher, realtime RealtimePublisher, presence PresenceReader,
) *Service {
	return &Service{
		clock: clock.Real{},
		pool:  pool, repo: repo, years: years, schedules: schedules, access: access, journals: journals,
		blocker: blocker, overrider: overrider, violations: violations, discipline: discipline,
		events: events, realtime: realtime, presence: presence,
	}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// SetLetterheadSource wires the school module's tenant letterhead/default
// signature reader in after construction (module.go, once the school
// module it depends on has itself been registered), for the report
// exports' Document.Letterhead/Signature.
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

// activeAcademicYear resolves the tenant's currently active academic year,
// the scope every attendance view implicitly uses.
func (s *Service) activeAcademicYear(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, error) {
	id, ok, err := s.years.GetActiveAcademicYearID(ctx, tenantID)
	if err != nil {
		return uuid.UUID{}, err
	}
	if !ok {
		return uuid.UUID{}, domain.ErrNoActiveAcademicYear
	}
	return id, nil
}

// tenantLocation loads the tenant's configured IANA timezone, falling back
// to UTC if it is unset or unrecognized rather than failing every
// attendance call over a bad setting.
func (s *Service) tenantLocation(ctx context.Context, tenantID uuid.UUID) *time.Location {
	tz, err := s.repo.GetTenantTimezone(ctx, tenantID)
	if err != nil || tz == "" {
		return time.UTC
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return time.UTC
	}
	return loc
}

// WithClock swaps the clock; tests use it to pin "now".
func (s *Service) WithClock(c clock.Clock) *Service {
	s.clock = c
	return s
}
