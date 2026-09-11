package events

import "github.com/google/uuid"

// Event name constants for domain events other modules publish once merged
// (docs/03-layered-architecture.md section 1: domain events are one of the
// two allowed cross-module communication paths). The notifications module
// subscribes to every one of these through RegisterEventHandlers; no
// publisher exists yet in this branch, so each handler is exercised by
// unit tests calling Bus.Publish directly until the owning module merges.
const (
	AttendanceSubmitted     = "attendance.submitted"
	SubstitutionRequested   = "substitution.requested"
	SubstitutionResponded   = "substitution.responded"
	LeaveRequestSubmitted   = "leave_request.submitted"
	LeaveRequestReviewed    = "leave_request.reviewed"
	LeaveRequestIssued      = "leave_request.issued"
	ExitPermitStageChanged  = "exit_permit.stage_changed"
	ExitPermitIssued        = "exit_permit.issued"
	ExitPermitExited        = "exit_permit.exited"
	LateArrivalOpened       = "late_arrival.opened"
	LateArrivalUpdated      = "late_arrival.updated"
	WarningLetterIssued     = "warning_letter.issued"
	AnnouncementPublished   = "announcement.published"
	LibraryReservationReady = "library.reservation_ready"
	LibraryLoanDueReminder  = "library.loan_due_reminder"
)

// Envelope is the generic shape every domain event above is published as.
// Publishers fill Subject with the recipient user ids the event concerns
// (e.g. the student and their homeroom teacher for a leave request) so
// subscribers never need to query another module's tables to find out who
// to notify.
type Envelope struct {
	Name    string
	Tenant  uuid.UUID
	Actor   uuid.UUID
	Subject []uuid.UUID
	Payload map[string]any
}

func (e Envelope) EventName() string { return e.Name }
