package service

import (
	"context"

	"github.com/google/uuid"
)

// instanceEventPayload is the minimal payload published for late-arrival
// and leave-request live events (docs/analysis/realtime-plan-2026-09-25.md
// section 2, opportunities #1 and #3): only the workflow instance id, since
// a client always re-fetches the full record through its already-
// authorized REST endpoint -- never the student's name, the reason, or any
// other detail.
type instanceEventPayload struct {
	InstanceID uuid.UUID `json:"instance_id"`
}

// instanceStageEventPayload adds the workflow stage key (opportunity #2,
// exit permits): a reviewer's queue needs to know which stage moved, not
// just that some instance changed.
type instanceStageEventPayload struct {
	InstanceID uuid.UUID `json:"instance_id"`
	Stage      string    `json:"stage"`
}

// dutySlugForStage maps a workflow stage key to the duty slug whose
// holders should be pushed a live update when the workflow reaches or
// leaves it. "class_teacher" (approver_rule teacher_of_class_now) is
// intentionally left unmapped: eligibility there is whichever specific
// teacher currently has the class on their schedule, not a duty a fixed
// group of people hold, and the realtime plan does not list a live screen
// for it (docs/analysis/realtime-plan-2026-09-25.md section 2).
func dutySlugForStage(stageKey string) (slug string, ok bool) {
	switch stageKey {
	case "duty_teacher":
		return "duty_teacher", true
	case "leadership":
		return "leadership", true
	case "counselor":
		return "counselor", true
	case "homeroom":
		return "homeroom", true
	case "security", "gate":
		return "security", true
	default:
		return "", false
	}
}

// publishToDutyStage is a small wrapper over RealtimePublisher.PublishToDuty
// that no-ops when stageKey has no duty mapping (dutySlugForStage), so
// every call site does not repeat that ok-check. classID only matters for
// "homeroom" (class-scoped); every other duty slug is tenant-wide.
func (s *Service) publishToDutyStage(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID, stageKey, eventType string, payload any) {
	slug, ok := dutySlugForStage(stageKey)
	if !ok {
		return
	}
	scoped := uuid.NullUUID{}
	if slug == "homeroom" {
		scoped = classID
	}
	_ = s.realtime.PublishToDuty(ctx, tenantID, slug, scoped, eventType, payload)
}

// publishToUserTopic is PublishToUser with the nil-safety every call site
// otherwise repeats (discarding the error: a dropped live push must never
// fail the use case it happened alongside, matching s.publish's rationale
// for platform/events.Bus in events.go).
func (s *Service) publishToUserTopic(ctx context.Context, tenantID, userID uuid.UUID, eventType string, payload any) {
	_ = s.realtime.PublishToUser(ctx, tenantID, userID, eventType, payload)
}
