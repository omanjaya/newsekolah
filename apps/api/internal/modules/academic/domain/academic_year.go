// Package domain holds the academic module's entities and pure business
// rules: academic years, terms, the calendar, grade structure, classes,
// enrollments, subjects, periods, and teaching assignments. No database or
// HTTP imports, per docs/03-layered-architecture.md section 1.
package domain

import (
	"strconv"
	"time"

	"github.com/google/uuid"
)

type AcademicYear struct {
	ID         uuid.UUID
	TenantID   uuid.UUID
	Label      string
	StartsOn   time.Time
	EndsOn     time.Time
	IsActive   bool
	ArchivedAt *time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (y AcademicYear) IsArchived() bool { return y.ArchivedAt != nil }

// ValidatePeriod enforces the ends_on > starts_on constraint already
// present in the database, so the service can reject bad input before a
// round trip.
func ValidatePeriod(startsOn, endsOn time.Time) error {
	if !endsOn.After(startsOn) {
		return ErrInvalidPeriod
	}
	return nil
}

// DefaultTermCount is used when a tenant has not set the "calendar.terms"
// policy: two semesters, the common case for Indonesian schools.
const DefaultTermCount = 2

type Term struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	Name           string
	Sequence       int16
	StartsOn       time.Time
	EndsOn         time.Time
	IsActive       bool
}

// BuildDefaultTerms splits a year's period into `count` equal-length terms
// named "Semester 1", "Semester 2", ... (or "Triwulan N" when count == 3),
// used to seed terms.calendar.terms policy on academic year creation.
func BuildDefaultTerms(yearID, tenantID uuid.UUID, startsOn, endsOn time.Time, count int) []Term {
	if count <= 0 {
		count = DefaultTermCount
	}
	totalDays := endsOn.Sub(startsOn)
	step := totalDays / time.Duration(count)

	label := "Semester"
	if count == 3 {
		label = "Triwulan"
	}

	terms := make([]Term, count)
	cursor := dateOnly(startsOn)
	for i := 0; i < count; i++ {
		// Each term ends on a whole day and the next one starts the day
		// after, so no calendar day belongs to two terms
		// (ValidateTermPlacement and the terms exclusion constraint).
		end := dateOnly(cursor.Add(step))
		if i == count-1 {
			end = dateOnly(endsOn)
		}
		terms[i] = Term{
			TenantID:       tenantID,
			AcademicYearID: yearID,
			Name:           label + " " + strconv.Itoa(i+1),
			Sequence:       int16(i + 1), // #nosec G115 -- count is a small admin-configured value
			StartsOn:       cursor,
			EndsOn:         end,
		}
		cursor = end.AddDate(0, 0, 1)
	}
	return terms
}

// ValidateTermPlacement checks a term's dates against its academic year
// and the year's other terms: the term must lie within the year, and no
// calendar day may belong to two terms (both ends inclusive, as the admin
// reads "13 Jul - 20 Des"). excludeID is the term being edited, so it is
// not compared with itself; pass uuid.Nil for a new term.
func ValidateTermPlacement(year AcademicYear, siblings []Term, excludeID uuid.UUID, startsOn, endsOn time.Time) error {
	start, end := dateOnly(startsOn), dateOnly(endsOn)
	if start.Before(dateOnly(year.StartsOn)) || end.After(dateOnly(year.EndsOn)) {
		return ErrTermOutsideYear
	}
	for _, t := range siblings {
		if t.ID == excludeID {
			continue
		}
		if !start.After(dateOnly(t.EndsOn)) && !dateOnly(t.StartsOn).After(end) {
			return ErrTermOverlap
		}
	}
	return nil
}

// dateOnly drops the clock part of t, keeping its calendar date, so dates
// read back from a date column and dates parsed from a request compare
// equal whatever zone or time of day they carry.
func dateOnly(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

const (
	CalendarEventHoliday       = "holiday"
	CalendarEventExam          = "exam"
	CalendarEventEvent         = "event"
	CalendarEventNoSchool      = "no_school"
	CalendarEventSemesterBreak = "semester_break"
)

var CalendarEventKinds = map[string]bool{
	CalendarEventHoliday:       true,
	CalendarEventExam:          true,
	CalendarEventEvent:         true,
	CalendarEventNoSchool:      true,
	CalendarEventSemesterBreak: true,
}

// CalendarEvent is a named event on an academic year's calendar, covering
// the inclusive date range [Date, EndDate]. GradeLevelIDs narrows the
// event to specific grade levels (e.g. an exam block for grade 12 only);
// an empty slice means it applies to every grade level.
type CalendarEvent struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	Date           time.Time
	EndDate        time.Time
	Kind           string
	Name           string
	GradeLevelIDs  []uuid.UUID
}

// ValidateCalendarEventRange enforces endDate >= date: a single-day event
// has endDate == date.
func ValidateCalendarEventRange(date, endDate time.Time) error {
	if endDate.Before(date) {
		return ErrInvalidCalendarEventRange
	}
	return nil
}

type SchoolDay struct {
	AcademicYearID uuid.UUID
	DayOfWeek      int16
	IsActive       bool
}
