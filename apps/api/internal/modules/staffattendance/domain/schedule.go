package domain

import "github.com/google/uuid"

// StatusCode is one staff_attendance_records.status_code value.
type StatusCode string

const (
	StatusPresent    StatusCode = "present"
	StatusLate       StatusCode = "late"
	StatusAbsent     StatusCode = "absent"
	StatusOnLeave    StatusCode = "on_leave"
	StatusHoliday    StatusCode = "holiday"
	StatusIncomplete StatusCode = "incomplete"
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

// CrossesMidnight reports whether the shift's end falls on the calendar
// day after its start.
func (d ScheduleDay) CrossesMidnight() bool {
	return d.EndMinute <= d.StartMinute
}
