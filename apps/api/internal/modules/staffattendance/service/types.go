// Package service implements staff attendance's use cases: work
// schedules, daily records (QR scan, manual entry, device import), the
// derived monthly recap and its XLSX export, and administrator
// corrections. Domain rules live in domain/; this package only
// orchestrates them with the repository and the two cross-module readers
// (academic calendar, permits leave), per
// docs/03-layered-architecture.md section 1.
package service

import (
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
)

// EmployeeRef is one row of this module's own roster (see
// ListStaffAttendanceRosterEmployees): a user who has at least one work
// schedule day configured.
type EmployeeRef struct {
	ID   uuid.UUID
	Name string
}

// ScheduleDayInput is one weekday of an employee's weekly schedule, as the
// schedule editor submits it.
type ScheduleDayInput struct {
	Weekday      int16
	IsWorkingDay bool
	StartMinute  int
	EndMinute    int
	GraceMinutes int
}

// RecordView is one day's record, always the output of ComputeLateness
// (even for a day that has no stored row yet), with the employee's name
// resolved for display.
type RecordView struct {
	RecordID          uuid.NullUUID
	EmployeeUserID    uuid.UUID
	EmployeeName      string
	Date              time.Time
	ArrivalAt         *time.Time
	DepartureAt       *time.Time
	StatusCode        domain.StatusCode
	LateMinutes       int
	EarlyLeaveMinutes int
	Source            domain.Source
	Notes             string
	// HolidayName names the calendar event behind a StatusCode of Holiday,
	// when one is on record; empty otherwise (including for every other
	// status, and for a Holiday day with no matching named event, e.g. an
	// ordinary weekend).
	HolidayName string
}

// EntryInput is a single day's arrival/departure for one employee, shared
// by the manual-entry and device-import operations (the only difference
// between them is the Source they're saved with).
type EntryInput struct {
	EmployeeUserID uuid.UUID
	Date           time.Time
	ArrivalAt      *time.Time
	DepartureAt    *time.Time
	Notes          string
}

// CorrectionInput is an administrator's change to an existing record. A
// nil pointer leaves that field unchanged; the explicit Clear flags exist
// because "remove this timestamp" cannot otherwise be distinguished from
// "leave it as is" through a nil pointer.
type CorrectionInput struct {
	ArrivalAt      *time.Time
	ClearArrival   bool
	DepartureAt    *time.Time
	ClearDeparture bool
	Notes          *string
	Reason         string
}

// MonthlyRecap is one employee's derived days for one month plus totals,
// the shape both the JSON endpoint and the XLSX export render from.
type MonthlyRecap struct {
	EmployeeUserID         uuid.UUID
	EmployeeName           string
	Month                  string
	Days                   []RecordView
	StatusTotals           map[domain.StatusCode]int
	TotalLateMinutes       int
	TotalEarlyLeaveMinutes int
}
