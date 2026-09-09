// Package service implements attendance's use cases: opening a session,
// recording and correcting entries, materializing the daily summary, the
// student calendar and homeroom views, reports, and the monitor snapshot.
// It orchestrates domain rules and the Repository; it holds no SQL and no
// HTTP concerns, per docs/03-layered-architecture.md section 1.
package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	scheduling "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// StudentRef is the minimal academic fact attendance needs about an
// enrolled student: enough to build a session roster or a report row,
// without importing the academic module's own richer type.
//
// -- cross-module read; replace with academic reader interface after merge --
type StudentRef struct {
	ID   uuid.UUID
	Name string
	NIS  string
}

// DailySummaryRow is one attendance_daily_summary row as the service reads
// and writes it -- the materialized result of domain.ComputeDailyStatus.
type DailySummaryRow struct {
	StudentUserID     uuid.UUID
	Date              time.Time
	StatusCode        string
	ExpectedSessions  int
	SubmittedSessions int
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

	CreateCorrection(ctx context.Context, c domain.Correction) (domain.Correction, error)

	UpsertDailySummary(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID, date time.Time, statusCode string, expected, submitted int) error
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
	ListCurrentPeriodScheduleCards(ctx context.Context, tenantID, academicYearID uuid.UUID, dayOfWeek int16, date, nowLocal time.Time) ([]MonitorCardRow, error)
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
	pool      *pgxpool.Pool
	repo      Repository
	years     AcademicYearReader
	schedules scheduling.ScheduleReader
	access    scheduling.AccessChecker
	journals  scheduling.JournalService
	blocker   Blocker
	overrider Overrider
	events    EventPublisher
	realtime  RealtimePublisher
	presence  PresenceReader
}

func New(
	pool *pgxpool.Pool, repo Repository, years AcademicYearReader,
	schedules scheduling.ScheduleReader, access scheduling.AccessChecker, journals scheduling.JournalService,
	blocker Blocker, overrider Overrider, events EventPublisher, realtime RealtimePublisher, presence PresenceReader,
) *Service {
	return &Service{
		pool: pool, repo: repo, years: years, schedules: schedules, access: access, journals: journals,
		blocker: blocker, overrider: overrider, events: events, realtime: realtime, presence: presence,
	}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
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
