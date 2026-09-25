// Package domain holds permits' entities, value objects, and state
// machine: pure business rules with no database or HTTP import, per
// docs/03-layered-architecture.md section 1. Approver rule *evaluation*
// (which needs duty assignments, schedules, and enrollments) lives in
// service/, since domain must not know about repositories.
package domain

import (
	"time"

	"github.com/google/uuid"
)

// Kind is a workflow_definitions.kind / workflow_instances.kind value.
type Kind string

const (
	KindExitPermit   Kind = "exit_permit"
	KindLateArrival  Kind = "late_arrival"
	KindLeaveRequest Kind = "leave_request"
)

func (k Kind) Valid() bool {
	switch k {
	case KindExitPermit, KindLateArrival, KindLeaveRequest:
		return true
	default:
		return false
	}
}

// Status is a workflow_instances.status value.
type Status string

const (
	StatusInProgress Status = "in_progress"
	StatusApproved   Status = "approved"
	StatusRejected   Status = "rejected"
	StatusCompleted  Status = "completed"
	StatusCancelled  Status = "cancelled"
	StatusExpired    Status = "expired"
)

// IsTerminal reports whether no further stage transition is possible.
func (s Status) IsTerminal() bool {
	switch s {
	case StatusRejected, StatusCompleted, StatusCancelled, StatusExpired:
		return true
	default:
		return false
	}
}

// Verification is how a stage is satisfied.
type Verification string

const (
	VerificationQRScan Verification = "qr_scan"
	VerificationManual Verification = "manual"
	VerificationAuto   Verification = "auto"
)

// Stage is one step of a Definition's ordered approval chain. ApproverRule
// is a string the rule registry in service/ parses at evaluation time
// (e.g. "any_teacher", "duty:picket", "teacher_of_class_now",
// "homeroom_of_student"); DistinctFrom names earlier stage Keys whose
// approver must differ from this stage's actor.
type Stage struct {
	Key            string       `json:"key"`
	Label          string       `json:"label"`
	ApproverRule   string       `json:"approver_rule"`
	Verification   Verification `json:"verification"`
	DistinctFrom   []string     `json:"distinct_from,omitempty"`
	LookaheadSlots int          `json:"lookahead_slots,omitempty"`
}

// Definition is one tenant's versioned stage list for a Kind.
type Definition struct {
	ID        uuid.UUID
	TenantID  uuid.UUID
	Kind      Kind
	Version   int
	IsActive  bool
	Stages    []Stage
	Config    map[string]any
	CreatedBy uuid.NullUUID
	CreatedAt time.Time
}

// StageAt returns the stage at index, or ErrStageIndexOutOfRange.
func (d Definition) StageAt(index int) (Stage, error) {
	if index < 0 || index >= len(d.Stages) {
		return Stage{}, ErrStageIndexOutOfRange
	}
	return d.Stages[index], nil
}

// NextIndex returns the index after current, and whether current was the
// last stage (in which case the instance completes rather than advances).
func (d Definition) NextIndex(current int) (next int, isLast bool) {
	if current+1 >= len(d.Stages) {
		return current, true
	}
	return current + 1, false
}

// StageByKey looks up a stage by its Key, used to resolve DistinctFrom
// references and to report which prior stage a rule failed against.
func (d Definition) StageByKey(key string) (Stage, bool) {
	for _, s := range d.Stages {
		if s.Key == key {
			return s, true
		}
	}
	return Stage{}, false
}

// Instance is one running (or finished) workflow for one subject.
type Instance struct {
	ID                uuid.UUID
	TenantID          uuid.UUID
	AcademicYearID    uuid.UUID
	DefinitionID      uuid.UUID
	Kind              Kind
	SubjectUserID     uuid.UUID
	ClassID           uuid.NullUUID
	CurrentStageIndex int
	Status            Status
	Payload           map[string]any
	OpenedAt          time.Time
	// LocalDate is the tenant-local calendar day OpenedAt fell on, set by
	// the service from the tenant's own timezone at creation
	// (service.tenantNow), not the server's UTC one -- see migration
	// 0120 and queries/workflow_instances.sql's CreateWorkflowInstance
	// and GetExitPermitInstanceForSubjectToday.
	LocalDate time.Time
	ClosedAt  *time.Time
	CreatedBy uuid.NullUUID
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Event is one immutable workflow_events row: a recorded transition.
type Event struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	InstanceID   uuid.UUID
	StageKey     string
	FromStatus   Status
	ToStatus     Status
	ActorUserID  uuid.NullUUID
	Verification Verification
	ScanTokenID  uuid.NullUUID
	Note         string
	OccurredAt   time.Time
}

// CanTransition reports whether an instance in status "in progress" can
// still be acted on. Every mutating service method starts by checking
// this instead of trusting the caller's view of the instance.
func (i Instance) CanTransition() bool {
	return i.Status == StatusInProgress
}
