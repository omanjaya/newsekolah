package domain

import (
	"time"

	"github.com/google/uuid"
)

// StatusCode is one staff_attendance_records.status_code value.
type StatusCode string

const (
	StatusPresent    StatusCode = "present"
	StatusLate       StatusCode = "late"
	StatusAbsent     StatusCode = "absent"
	StatusOnLeave    StatusCode = "on_leave"
	StatusHoliday    StatusCode = "holiday"
	StatusIncomplete StatusCode = "incomplete"
	// StatusUnscheduled is a day with no weekly schedule row at all for the
	// employee's weekday -- a configuration gap, never a day off. Distinct
	// from StatusHoliday (the calendar, or the employee's own configured
	// schedule, says no work is expected), which is a genuine "nothing to
	// do today".
	StatusUnscheduled StatusCode = "unscheduled"
)

// Source is one staff_attendance_records.source value: how the record's
// arrival/departure timestamps were captured.
type Source string

const (
	SourceQR     Source = "qr"
	SourceManual Source = "manual"
	SourceImport Source = "import"
)

// ScheduleDay is one weekday of an employee's expected working hours,
// staff_attendance_schedules row shape. StartMinute/EndMinute are minutes
// since local midnight; EndMinute <= StartMinute means the shift crosses
// midnight (e.g. a 22:00-06:00 night shift).
type ScheduleDay struct {
	EmployeeUserID uuid.UUID
	Weekday        int16 // 1 (Monday) .. 7 (Sunday), ISO convention
	IsWorkingDay   bool
	StartMinute    int
	EndMinute      int
	GraceMinutes   int
	// CreatedAt is when this weekday was first given a schedule row. A
	// schedule is not retroactive: a day before it existed has no
	// expectation to be absent from (see AsOf). Zero means "always in
	// effect".
	CreatedAt time.Time
	// WorkingSince is when a working weekday last turned into one; zero on
	// a day off. Between CreatedAt and WorkingSince the weekday was a
	// configured day off, so its days then are holidays, not gaps in the
	// configuration (see AsOf). Zero on a working day means "since
	// CreatedAt".
	WorkingSince time.Time
}

func (d ScheduleDay) Valid() bool {
	if d.Weekday < 1 || d.Weekday > 7 {
		return false
	}
	if d.GraceMinutes < 0 {
		return false
	}
	if d.StartMinute < 0 || d.StartMinute > 1439 || d.EndMinute < 0 || d.EndMinute > 1439 {
		return false
	}
	return true
}

// AsOf is this schedule row as it stood on day, the local midnight of a
// calendar date in the school's zone, for a day with no stored record:
// nil before the row existed (the school-local date of CreatedAt,
// inclusive), so giving someone a first schedule never turns the weeks
// before it into absences; a day off before a working weekday's
// WorkingSince, so turning a day off into a working day later keeps its
// earlier occurrences days off rather than absences or "no schedule"; the
// row itself otherwise.
func (d ScheduleDay) AsOf(day time.Time) *ScheduleDay {
	if !d.CreatedAt.IsZero() && day.Before(localMidnight(d.CreatedAt, day.Location())) {
		return nil
	}
	if d.IsWorkingDay && !d.WorkingSince.IsZero() && day.Before(localMidnight(d.WorkingSince, day.Location())) {
		off := d
		off.IsWorkingDay = false
		return &off
	}
	return &d
}

func localMidnight(at time.Time, loc *time.Location) time.Time {
	y, m, dd := at.In(loc).Date()
	return time.Date(y, m, dd, 0, 0, 0, 0, loc)
}

// CrossesMidnight reports whether the shift's end falls on the calendar
// day after its start.
func (d ScheduleDay) CrossesMidnight() bool {
	return d.EndMinute <= d.StartMinute
}
