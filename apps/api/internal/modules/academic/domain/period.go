package domain

import (
	"github.com/google/uuid"
)

type PeriodTemplate struct {
	ID        uuid.UUID
	TenantID  uuid.UUID
	Name      string
	IsDefault bool
}

// ClockTime is a wall-clock time of day (no date, no zone): periods.starts_at
// / ends_at are Postgres `time` columns, and comparing them only makes
// sense once the caller has already resolved "now" to the tenant's zone.
type ClockTime struct {
	Hour   int
	Minute int
}

func (t ClockTime) Minutes() int { return t.Hour*60 + t.Minute }

func (t ClockTime) Before(other ClockTime) bool { return t.Minutes() < other.Minutes() }

type Period struct {
	ID         uuid.UUID
	TenantID   uuid.UUID
	TemplateID uuid.UUID
	Name       string
	Sequence   int16
	StartsAt   ClockTime
	EndsAt     ClockTime
	IsBreak    bool
}

// ValidatePeriodTimes enforces the starts_at < ends_at constraint already
// present in the database, so the service rejects bad input before a round
// trip.
func ValidatePeriodTimes(startsAt, endsAt ClockTime) error {
	if !startsAt.Before(endsAt) {
		return ErrInvalidPeriod
	}
	return nil
}

// CurrentPeriod returns the period whose [StartsAt, EndsAt) window contains
// now, from a template's periods, or false when now falls in a gap (before
// the first period, after the last, or between periods). Pure function so
// the "periods/today" use case is unit-testable without a clock or a
// database.
func CurrentPeriod(periods []Period, now ClockTime) (Period, bool) {
	for _, p := range periods {
		if !now.Before(p.StartsAt) && now.Before(p.EndsAt) {
			return p, true
		}
	}
	return Period{}, false
}

const (
	WeekdayMonday = 1
	WeekdaySunday = 7
	MinDayOfWeek  = WeekdayMonday
	MaxDayOfWeek  = WeekdaySunday
)

func ValidateDayOfWeek(day int16) error {
	if day < MinDayOfWeek || day > MaxDayOfWeek {
		return ErrInvalidDayOfWeek
	}
	return nil
}

// WeekdayAssignment maps one day of the week, for one academic year, to the
// period template in effect that day (period_day_assignments).
type WeekdayAssignment struct {
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	DayOfWeek      int16
	TemplateID     uuid.UUID
}
