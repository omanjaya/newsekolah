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

// ScheduleDay is one version of one weekday of an employee's expected
// working hours, staff_attendance_schedules row shape. StartMinute/
// EndMinute are minutes since local midnight; EndMinute <= StartMinute
// means the shift crosses midnight (e.g. a 22:00-06:00 night shift).
type ScheduleDay struct {
	EmployeeUserID uuid.UUID
	Weekday        int16 // 1 (Monday) .. 7 (Sunday), ISO convention
	IsWorkingDay   bool
	StartMinute    int
	EndMinute      int
	GraceMinutes   int
	// EffectiveFrom is the school calendar date this version applies from,
	// until the next version of the same weekday (see ScheduleHistory), as
	// a midnight-UTC time.Time like clock.LocalDate returns.
	EffectiveFrom time.Time
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

// SameHours reports whether d and other expect the same of the employee:
// the same working flag, start, end and grace. A save that leaves a
// weekday's hours as they are adds no version.
func (d ScheduleDay) SameHours(other ScheduleDay) bool {
	return d.IsWorkingDay == other.IsWorkingDay && d.StartMinute == other.StartMinute &&
		d.EndMinute == other.EndMinute && d.GraceMinutes == other.GraceMinutes
}

// ScheduleHistory is every version of one employee's weekdays, oldest
// first: a version of a weekday applies from its EffectiveFrom until the
// next one, and of two versions with the same EffectiveFrom the later in
// the slice (the later save) wins. A schedule change is never retroactive:
// each past date is judged by the version in effect on it, so turning a
// working weekday off keeps its earlier days absences, and turning a day
// off into a working day keeps its earlier days off.
type ScheduleHistory []ScheduleDay

// InEffect is the version of weekday in effect on date (its calendar date,
// in whatever location it carries), or nil before the weekday's first
// version: giving someone a first schedule never turns the weeks before it
// into absences, they have no schedule then (StatusUnscheduled).
func (h ScheduleHistory) InEffect(weekday int16, date time.Time) *ScheduleDay {
	day := calendarDate(date)
	var found *ScheduleDay
	for i := range h {
		v := &h[i]
		if v.Weekday != weekday || calendarDate(v.EffectiveFrom).After(day) {
			continue
		}
		if found == nil || !calendarDate(v.EffectiveFrom).Before(calendarDate(found.EffectiveFrom)) {
			found = v
		}
	}
	if found == nil {
		return nil
	}
	out := *found
	return &out
}

// ForRecord is the version a stored record on date is judged by: the one
// in effect on date, or the weekday's first version for a date before it,
// so a check-in made, or a device import or manual backfill entered,
// before the schedule existed is still judged once it does. Nil when the
// weekday has no version at all.
func (h ScheduleHistory) ForRecord(weekday int16, date time.Time) *ScheduleDay {
	if v := h.InEffect(weekday, date); v != nil {
		return v
	}
	var first *ScheduleDay
	for i := range h {
		v := &h[i]
		if v.Weekday == weekday && (first == nil || calendarDate(v.EffectiveFrom).Before(calendarDate(first.EffectiveFrom))) {
			first = v
		}
	}
	if first == nil {
		return nil
	}
	out := *first
	return &out
}

// Week is the version of each weekday in effect on date, Monday first,
// leaving out a weekday with none yet: the week the schedule editor shows
// and a save is compared against.
func (h ScheduleHistory) Week(date time.Time) []ScheduleDay {
	out := make([]ScheduleDay, 0, 7)
	for weekday := int16(1); weekday <= 7; weekday++ {
		if v := h.InEffect(weekday, date); v != nil {
			out = append(out, *v)
		}
	}
	return out
}

// calendarDate is t's calendar date in its own location as a midnight-UTC
// time.Time, the form EffectiveFrom carries.
func calendarDate(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

// CrossesMidnight reports whether the shift's end falls on the calendar
// day after its start.
func (d ScheduleDay) CrossesMidnight() bool {
	return d.EndMinute <= d.StartMinute
}
