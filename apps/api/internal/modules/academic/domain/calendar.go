package domain

import (
	"time"

	"github.com/google/uuid"
)

// nonTeachingKinds are the calendar event kinds that cancel classes for the
// day(s) they cover. "exam" and "event" do not: an exam day is still a
// school day for attendance purposes.
var nonTeachingKinds = map[string]bool{
	CalendarEventHoliday:       true,
	CalendarEventNoSchool:      true,
	CalendarEventSemesterBreak: true,
}

// IsoWeekday converts Go's Sunday=0 weekday to the ISO-8601 Monday=1..
// Sunday=7 convention school_days.day_of_week uses.
func IsoWeekday(t time.Time) int16 {
	if t.Weekday() == time.Sunday {
		return WeekdaySunday
	}
	return int16(t.Weekday()) //nolint:gosec // time.Weekday is 0-6, always fits in int16
}

// IsSchoolDay is the single domain rule that answers "is date a teaching
// day", combining the academic year's weekly pattern (weeklyActive: is
// this weekday normally in session) with its calendar of named events.
// events should already be filtered to the academic year in question; this
// function does not look at AcademicYearID.
//
// gradeLevelID scopes the check to one grade level: an event targeting
// only certain grade levels (GradeLevelIDs non-empty) cancels teaching
// only for those; an event with no grade levels listed applies
// school-wide. Pass nil for a whole-school check (matches only events that
// are themselves school-wide).
//
// Pure and side-effect free so it can be unit tested without a database,
// and so other modules (e.g. attendance's daily-status algorithm) can
// reuse the exact same rule via the module's reader interface instead of
// re-deriving it.
func IsSchoolDay(date time.Time, weeklyActive bool, events []CalendarEvent, gradeLevelID *uuid.UUID) bool {
	if !weeklyActive {
		return false
	}
	for _, e := range events {
		if nonTeachingKinds[e.Kind] && eventCoversDate(e, date) && eventTargets(e, gradeLevelID) {
			return false
		}
	}
	return true
}

// NonTeachingEventName is IsSchoolDay's counterpart for display: the name
// of the first non-teaching calendar event (holiday, no-school day,
// semester break) covering date and targeting gradeLevelID, if any. Used
// where a caller already knows the day is not a working day and wants to
// show why (e.g. staff attendance's check-in screen naming the holiday
// instead of a bare "Libur"). weeklyActive is not consulted here -- an
// ordinary weekend has no event to name, and that is a legitimate "no
// name available" rather than an error.
func NonTeachingEventName(date time.Time, events []CalendarEvent, gradeLevelID *uuid.UUID) (string, bool) {
	for _, e := range events {
		if nonTeachingKinds[e.Kind] && eventCoversDate(e, date) && eventTargets(e, gradeLevelID) {
			return e.Name, true
		}
	}
	return "", false
}

func eventCoversDate(e CalendarEvent, date time.Time) bool {
	d := truncateToDay(date)
	start := truncateToDay(e.Date)
	end := truncateToDay(e.EndDate)
	if end.Before(start) {
		end = start
	}
	return !d.Before(start) && !d.After(end)
}

func truncateToDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// eventTargets reports whether calendar event e applies to gradeLevelID.
func eventTargets(e CalendarEvent, gradeLevelID *uuid.UUID) bool {
	if len(e.GradeLevelIDs) == 0 {
		return true
	}
	if gradeLevelID == nil {
		return false
	}
	for _, id := range e.GradeLevelIDs {
		if id == *gradeLevelID {
			return true
		}
	}
	return false
}
