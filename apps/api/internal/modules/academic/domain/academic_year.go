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
	cursor := startsOn
	for i := 0; i < count; i++ {
		end := cursor.Add(step)
		if i == count-1 {
			end = endsOn
		}
		terms[i] = Term{
			TenantID:       tenantID,
			AcademicYearID: yearID,
			Name:           label + " " + strconv.Itoa(i+1),
			Sequence:       int16(i + 1), // #nosec G115 -- count is a small admin-configured value
			StartsOn:       cursor,
			EndsOn:         end,
		}
		cursor = end
	}
	return terms
}

const (
	CalendarEventHoliday  = "holiday"
	CalendarEventExam     = "exam"
	CalendarEventEvent    = "event"
	CalendarEventNoSchool = "no_school"
)

var CalendarEventKinds = map[string]bool{
	CalendarEventHoliday:  true,
	CalendarEventExam:     true,
	CalendarEventEvent:    true,
	CalendarEventNoSchool: true,
}

type CalendarEvent struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	Date           time.Time
	Kind           string
	Name           string
}

type SchoolDay struct {
	AcademicYearID uuid.UUID
	DayOfWeek      int16
	IsActive       bool
}
