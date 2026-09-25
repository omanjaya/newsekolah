package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// FeatureFlagModule is the feature_flags.module value this package checks
// before every operation, matching
// platform/domain.ModuleStaffAttendance -- duplicated as a plain string
// rather than importing the platform module package, since a module's
// service layer may only depend on its own repository interface and
// platform/* packages per docs/03-layered-architecture.md section 1.
const FeatureFlagModule = "staff_attendance"

// Repository is staff attendance's data-access boundary, implemented by
// repository.Repository using sqlc.
type Repository interface {
	// Feature flag. A tenant with no row for this module is enabled by
	// default, matching platform/service.ListFlags's "opt-out" semantics.
	IsFeatureEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error)

	// Schedules.
	UpsertScheduleDay(ctx context.Context, tenantID, employeeUserID, actorID uuid.UUID, day domain.ScheduleDay) (domain.ScheduleDay, error)
	ListScheduleDays(ctx context.Context, tenantID, employeeUserID uuid.UUID) ([]domain.ScheduleDay, error)
	ListRosterEmployees(ctx context.Context, tenantID uuid.UUID) ([]EmployeeRef, error)
	GetEmployeeName(ctx context.Context, tenantID, employeeUserID uuid.UUID) (string, error)

	// Records.
	GetRecord(ctx context.Context, tenantID, recordID uuid.UUID) (domain.Record, bool, error)
	GetRecordByEmployeeDate(ctx context.Context, tenantID, employeeUserID uuid.UUID, date time.Time) (domain.Record, bool, error)
	UpsertRecord(ctx context.Context, rec domain.Record) (domain.Record, error)
	ReplaceRecordFields(ctx context.Context, tenantID uuid.UUID, rec domain.Record) (domain.Record, error)
	ListRecordsByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) ([]domain.Record, error)
	ListRecordsByEmployeeRange(ctx context.Context, tenantID, employeeUserID uuid.UUID, from, to time.Time) ([]domain.Record, error)

	// Corrections.
	CreateCorrection(ctx context.Context, tenantID, recordID, changedBy uuid.UUID, reason string, previous, next domain.Snapshot) error
}

// CalendarReader is the narrow read surface this module needs from the
// academic module's calendar, reached through an adapter in
// internal/wiring rather than importing academic directly, per
// docs/03-layered-architecture.md section 1.
type CalendarReader interface {
	IsSchoolDay(ctx context.Context, tenantID, academicYearID uuid.UUID, date time.Time) (bool, error)
	// HolidayName names the calendar event making date a non-working day,
	// if any is on record; found is false for an ordinary weekend/no-school
	// weekday with no named event.
	HolidayName(ctx context.Context, tenantID, academicYearID uuid.UUID, date time.Time) (name string, found bool, err error)
}

// AcademicYearReader resolves the tenant's currently active academic year,
// mirroring attendance/service.AcademicYearReader's pattern.
type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
}

// LeaveReader is the narrow read surface this module needs from permits:
// whether an employee has an approved (issued) leave request covering a
// date, reached through an adapter in internal/wiring rather than a
// second leave concept of this module's own.
type LeaveReader interface {
	OnApprovedLeave(ctx context.Context, tenantID, employeeUserID uuid.UUID, date time.Time) (bool, error)
}

// RealtimePublisher pushes a live update after a self-service QR scan
// (Scan, records.go), to every holder of a fixed role (PublishRole, e.g.
// "hr") and to every holder of a duty assignment (PublishDuty, e.g. the
// picket teacher covering the front desk) -- docs/analysis/
// realtime-plan-2026-09-25.md section 2, opportunity #8's "role:<tenant>:
// hr / duty piket". Both mirror platform/realtime.TopicRole/TopicDuty
// without this package importing platform/realtime directly, the same
// pattern permits/service.RealtimePublisher and attendance/service.
// RealtimePublisher use. A nil RealtimePublisher (no Hub wired) makes
// every push a no-op rather than failing the scan itself.
type RealtimePublisher interface {
	PublishRole(tenantID uuid.UUID, role, eventType string, payload any) error
	PublishDuty(tenantID uuid.UUID, dutySlug string, classID uuid.NullUUID, eventType string, payload any) error
}

type Service struct {
	pool       *pgxpool.Pool
	repo       Repository
	years      AcademicYearReader
	calendar   CalendarReader
	leave      LeaveReader
	realtime   RealtimePublisher
	letterhead reportdoc.LetterheadSource
	clock      clock.Clock
}

// New wires a Service. letterhead may be nil (a tenant's kop laporan
// simply never shows on this module's exports then) -- most tests have
// no reason to fake it. realtime may be nil (no Hub wired): every live
// push then silently no-ops.
func New(pool *pgxpool.Pool, repo Repository, years AcademicYearReader, calendar CalendarReader, leave LeaveReader, letterhead reportdoc.LetterheadSource, realtime RealtimePublisher) *Service {
	return &Service{pool: pool, repo: repo, years: years, calendar: calendar, leave: leave, realtime: realtime, letterhead: letterhead, clock: clock.Real{}}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

// assertEnabled is the feature-flag gate every public operation runs
// first, per docs/03-layered-architecture.md section 5: a disabled module
// must behave as if it were not installed.
func (s *Service) assertEnabled(ctx context.Context, tenantID uuid.UUID) error {
	enabled, err := s.repo.IsFeatureEnabled(ctx, tenantID, FeatureFlagModule)
	if err != nil {
		return err
	}
	if !enabled {
		return domain.ErrModuleDisabled
	}
	return nil
}

// today truncates the clock's current instant to a calendar date in loc,
// used wherever the caller does not name an explicit date (QR scan,
// today's board).
func (s *Service) today(loc *time.Location) time.Time {
	now := s.clock.Now().In(loc)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
}

// activeAcademicYear resolves the tenant's active academic year, or
// uuid.Nil with ok=false when the tenant has not set one up yet.
func (s *Service) activeAcademicYear(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error) {
	return s.years.GetActiveAcademicYearID(ctx, tenantID)
}

// isWorkingDay resolves the academic calendar's answer for date, treating
// "no active academic year" as "every weekday counts": staff attendance
// must keep working even before a school has set up its first academic
// year, unlike student-facing modules that hard-require one.
func (s *Service) isWorkingDay(ctx context.Context, tenantID, yearID uuid.UUID, hasYear bool, date time.Time) (bool, error) {
	if !hasYear {
		return true, nil
	}
	return s.calendar.IsSchoolDay(ctx, tenantID, yearID, date)
}

// computeStatus resolves the three inputs ComputeLateness needs beyond the
// arrival/departure pair itself -- the employee's schedule for date's
// weekday, whether the calendar counts date as a working day, and whether
// permits has an approved leave covering date -- and runs the pure rule.
// The second return value names the calendar event behind a Holiday
// result, when the calendar (rather than the employee's own schedule) is
// what made it a holiday and a matching event is on record; it is empty
// otherwise, including for StatusUnscheduled (a configuration gap has no
// event to name).
func (s *Service) computeStatus(
	ctx context.Context, tenantID, employeeUserID uuid.UUID, date time.Time, arrival, departure *time.Time,
) (domain.LatenessResult, string, error) {
	days, err := s.repo.ListScheduleDays(ctx, tenantID, employeeUserID)
	if err != nil {
		return domain.LatenessResult{}, "", err
	}
	weekday := domain.IsoWeekday(date)
	var schedule *domain.ScheduleDay
	for _, d := range days {
		if d.Weekday == weekday {
			day := d
			schedule = &day
			break
		}
	}

	yearID, hasYear, err := s.activeAcademicYear(ctx, tenantID)
	if err != nil {
		return domain.LatenessResult{}, "", err
	}
	isWorking, err := s.isWorkingDay(ctx, tenantID, yearID, hasYear, date)
	if err != nil {
		return domain.LatenessResult{}, "", err
	}
	onLeave, err := s.leave.OnApprovedLeave(ctx, tenantID, employeeUserID, date)
	if err != nil {
		return domain.LatenessResult{}, "", err
	}

	result := domain.ComputeLateness(domain.LatenessInput{
		Date: date, Schedule: schedule, IsWorkingDay: isWorking, OnLeave: onLeave,
		ArrivalAt: arrival, DepartureAt: departure,
	})

	holidayName := ""
	// Only worth asking the calendar when it is the one that made this a
	// holiday: an employee's own schedule saying "not a working day" has
	// no calendar event behind it.
	if result.StatusCode == domain.StatusHoliday && !isWorking && hasYear {
		if name, found, err := s.calendar.HolidayName(ctx, tenantID, yearID, date); err != nil {
			return domain.LatenessResult{}, "", err
		} else if found {
			holidayName = name
		}
	}

	return result, holidayName, nil
}

func toRecordView(rec domain.Record, employeeName string) RecordView {
	return RecordView{
		RecordID: uuid.NullUUID{UUID: rec.ID, Valid: rec.ID != uuid.Nil}, EmployeeUserID: rec.EmployeeUserID, EmployeeName: employeeName,
		Date: rec.Date, ArrivalAt: rec.ArrivalAt, DepartureAt: rec.DepartureAt,
		StatusCode: rec.StatusCode, LateMinutes: rec.LateMinutes, EarlyLeaveMinutes: rec.EarlyLeaveMinutes,
		Source: rec.Source, Notes: rec.Notes,
	}
}
