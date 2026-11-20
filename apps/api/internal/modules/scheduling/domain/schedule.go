// Package domain holds scheduling's entities and business rules: conflict
// detection, contiguous-period merging, and the teacher self-service edit
// window. Nothing here imports pgx, chi, or gen/*, per
// docs/03-layered-architecture.md section 1 -- every rule is a plain
// function over plain structs so it can be unit tested without a database.
package domain

import (
	"time"

	"github.com/google/uuid"
)

// Source records who created a schedule row and therefore which rules
// apply to editing it: an admin schedule can be edited by anyone with
// manage_schedules; a teacher schedule is self-service, bounded by the
// tenant's schedule.teacher_edit_deadline setting; an import row behaves
// like admin but keeps the distinction for audit.
type Source string

const (
	SourceAdmin   Source = "admin"
	SourceTeacher Source = "teacher"
	SourceImport  Source = "import"
)

// Schedule is one version of a weekly recurring teaching slot: a class
// studying a subject with a teacher over a contiguous range of periods on
// one day of the week, for one academic year, from EffectiveFrom through
// EffectiveUntil (both inclusive, both on DayOfWeek; nil EffectiveUntil
// means to the end of the year). A change to a lesson that already has
// history ends the old version and starts a new one (see effective.go), so
// what was recorded keeps pointing at the lesson as it was.
type Schedule struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	TermID         uuid.NullUUID
	ClassID        uuid.UUID
	SubjectID      uuid.UUID
	TeacherUserID  uuid.UUID
	RoomID         uuid.NullUUID
	DayOfWeek      int16 // ISO-ish 1..7, Monday=1, matching school_days.day_of_week
	StartPeriodID  uuid.UUID
	EndPeriodID    uuid.UUID
	StartSeq       int16
	EndSeq         int16
	Source         Source
	Notes          string
	CreatedBy      uuid.NullUUID
	UpdatedBy      uuid.NullUUID
	CreatedAt      time.Time
	UpdatedAt      time.Time
	// EffectiveFrom and EffectiveUntil are calendar dates at midnight UTC,
	// the form clock.LocalDate returns and a Postgres date decodes to.
	EffectiveFrom  time.Time
	EffectiveUntil *time.Time
}

// EffectiveOn reports whether this version is on the timetable on date d
// (compared as calendar dates, both bounds inclusive). It does not check
// the weekday: a caller asking about a date already picked the weekday.
func (s Schedule) EffectiveOn(d time.Time) bool {
	return DateRangeContains(s.EffectiveFrom, s.EffectiveUntil, d)
}

// EndedBefore reports whether the version's last date lies before today:
// it is no longer on the timetable and nothing about it can change.
func (s Schedule) EndedBefore(today time.Time) bool {
	return s.EffectiveUntil != nil && CalendarDate(*s.EffectiveUntil).Before(CalendarDate(today))
}

// overlapsDates reports whether s and other are both in effect on at least
// one common date, the effective_range && effective_range half of the
// database's exclusion constraints.
func (s Schedule) overlapsDates(other Schedule) bool {
	return !after(s.EffectiveFrom, other.EffectiveUntil) && !after(other.EffectiveFrom, s.EffectiveUntil)
}

// after reports whether from lies after until (false when until is open).
func after(from time.Time, until *time.Time) bool {
	return until != nil && CalendarDate(from).After(CalendarDate(*until))
}

// overlapsPeriods reports whether s and other occupy at least one common period
// sequence number, the condition the database's GiST exclusion constraints
// also test (period_range && period_range). Two schedules can only clash
// when they share both a day and this.
func (s Schedule) overlapsPeriods(other Schedule) bool {
	return s.StartSeq <= other.EndSeq && other.StartSeq <= s.EndSeq
}

// ValidatePeriodRange checks the invariant the schedules table also
// enforces (end_seq >= start_seq > 0): kept here too so a service can
// reject a bad request with a domain error before ever reaching the
// database.
func ValidatePeriodRange(startSeq, endSeq int16) error {
	if startSeq <= 0 {
		return ErrInvalidPeriodRange
	}
	if endSeq < startSeq {
		return ErrInvalidPeriodRange
	}
	return nil
}
