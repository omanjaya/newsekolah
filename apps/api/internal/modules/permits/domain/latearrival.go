package domain

import (
	"time"

	"github.com/google/uuid"
)

// RequiredAction is a late_arrivals.required_action value.
type RequiredAction string

const (
	RequiredActionNone       RequiredAction = "none"
	RequiredActionCallParent RequiredAction = "call_parent"
	RequiredActionSendHome   RequiredAction = "send_home"
)

// DefaultLateArrivalActions is the tenant_policies(kind='late_arrival_actions')
// default: the 2nd and 5th late arrival in a year call the parent, the 3rd
// and 6th send the student home (docs/analysis/backend-inventory.md 1.16).
// A tenant overrides this by writing its own occurrence-number -> action
// map into tenant_policies; ActionForOccurrence takes that map so the
// policy is data, not code.
func DefaultLateArrivalActions() map[int]RequiredAction {
	return map[int]RequiredAction{
		2: RequiredActionCallParent,
		3: RequiredActionSendHome,
		5: RequiredActionCallParent,
		6: RequiredActionSendHome,
	}
}

// ActionForOccurrence looks up the required action for the occurrence-th
// late arrival this academic year (1-based, matching the old app's
// late_count). An occurrence with no configured action is RequiredActionNone.
func ActionForOccurrence(occurrence int, policy map[int]RequiredAction) RequiredAction {
	if action, ok := policy[occurrence]; ok {
		return action
	}
	return RequiredActionNone
}

// LateArrival is one late_arrivals row, always paired 1:1 with a
// workflow_instances row of kind late_arrival (instance_id is the shared
// primary key).
type LateArrival struct {
	InstanceID       uuid.UUID
	TenantID         uuid.UUID
	Reason           string
	OccurrenceNumber int
	RequiredAction   RequiredAction
	HomeroomReported bool
	CompletedAt      *time.Time
}
