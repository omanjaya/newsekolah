package domain

import (
	"time"

	"github.com/google/uuid"
)

// Record is one staff_attendance_records row: an employee's arrival and
// departure for a single calendar date, the status derived from
// ComputeLateness, and the source that produced the timestamps.
type Record struct {
	ID                uuid.UUID
	TenantID          uuid.UUID
	EmployeeUserID    uuid.UUID
	Date              time.Time
	ArrivalAt         *time.Time
	DepartureAt       *time.Time
	StatusCode        StatusCode
	LateMinutes       int
	EarlyLeaveMinutes int
	Source            Source
	Notes             string
	CreatedBy         uuid.NullUUID
	UpdatedBy         uuid.NullUUID
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// Snapshot is the subset of Record a correction records before and after
// the change, kept as JSON in staff_attendance_corrections so the audit
// trail is self-contained even if the record itself is later corrected
// again.
type Snapshot struct {
	ArrivalAt   *time.Time `json:"arrival_at"`
	DepartureAt *time.Time `json:"departure_at"`
	StatusCode  StatusCode `json:"status_code"`
	Notes       string     `json:"notes"`
}

func (r Record) ToSnapshot() Snapshot {
	return Snapshot{ArrivalAt: r.ArrivalAt, DepartureAt: r.DepartureAt, StatusCode: r.StatusCode, Notes: r.Notes}
}
