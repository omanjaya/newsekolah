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

func (Submitted) EventName() string { return "attendance.submitted" }

// MonitorUpdate is the payload pushed to the "monitor:<tenantID>" realtime
// topic after a session is submitted, so a monitor display can refresh its
// per-class card without polling GetMonitorSnapshot.
type MonitorUpdate struct {
	ClassID     uuid.UUID  `json:"class_id"`
	SessionID   uuid.UUID  `json:"session_id"`
	SubmittedAt *time.Time `json:"submitted_at,omitempty"`
}
