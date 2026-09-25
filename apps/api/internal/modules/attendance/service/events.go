package service

import (
	"time"

	"github.com/google/uuid"
)

// Submitted is published once per SaveEntries call that submits (or
// resubmits) a session, for any not-yet-merged module (notifications,
// permits) that wants to react without this package importing them.
// Mirrors scheduling/service/substitution.go's SubstitutionRequested
// pattern: a plain struct satisfying the local Event interface.
type Submitted struct {
	TenantID     uuid.UUID
	SessionID    uuid.UUID
	ScheduleID   uuid.UUID
	ClassID      uuid.UUID
	Date         time.Time
	SubmittedBy  uuid.UUID
	StudentCount int
}

// EventName is this package's own internal events.Bus routing key, and
// deliberately NOT events.AttendanceSubmitted ("attendance.submitted"):
// every other module keeps its internal domain-event name and its
// notification-facing events.Envelope name distinct (e.g. permits'
// LeaveRequestSubmitted.EventName() is "permits.leave_request.submitted",
// while events.LeaveRequestSubmitted is "leave_request.submitted") so
// wiring/eventbridge.go's bridge can subscribe to the raw domain event,
// compute recipients, and republish an events.Envelope under the
// notification-facing name on the SAME bus without the republish
// re-triggering its own subscriber. This type previously used
// "attendance.submitted" for both, which -- once attendance/module.go's
// busPublisher started wrapping Submitted into an events.Envelope before
// putting it on the bus (needed so notifications/service/events.go's own
// generic Envelope-consuming subscriber, registered under the same
// "attendance.submitted" name, stopped erroring) -- made
// eventbridge.go's unsafe `evt.(attendanceservice.Submitted)` type
// assertion panic on every single attendance submission, tenant-wide,
// unconditionally (docs/06-database-schema.md's clean-code rule against
// silent failure modes not withstanding: this one crashed loudly, but the
// user just saw "an error occurred, try again" with no indication
// attendance itself failed to save). See eventbridge_test.go.
func (Submitted) EventName() string { return "attendance.session_submitted" }

// MonitorUpdate is the payload pushed to the "monitor:<tenantID>" realtime
// topic after a session is submitted, so a monitor display can refresh its
// per-class card without polling GetMonitorSnapshot.
type MonitorUpdate struct {
	ClassID     uuid.UUID  `json:"class_id"`
	SessionID   uuid.UUID  `json:"session_id"`
	SubmittedAt *time.Time `json:"submitted_at,omitempty"`
}
