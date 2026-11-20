package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// ThresholdReached is published the moment a student's active total
// crosses a new SP level, before any letter is issued, so a counselor can
// be nudged early. The old app intended this (violation_warning_letters.go
// referenced it) but never actually published anything (docs inventory
// 1.17); this is the first real publisher.
type ThresholdReached struct {
	TenantID        uuid.UUID
	StudentUserID   uuid.UUID
	ClassID         uuid.NullUUID
	Level           int
	LevelLabel      string
	ThresholdPoints int
	TotalPoints     int
}

// EventName is distinct from platform/events.DisciplineThresholdReached so
// the notification bridge's Envelope republish never reaches its own typed
// subscriber (see scheduling's SubstitutionRequested.EventName).
func (ThresholdReached) EventName() string { return "discipline.student_threshold_reached" }

// ViolationRecorded is published for every RecordViolation call that
// wrote at least one record, inside its transaction, so a reader of the
// student's standing (early warning) can refresh it with the record.
type ViolationRecorded struct {
	TenantID      uuid.UUID
	StudentUserID uuid.UUID
}

func (ViolationRecorded) EventName() string { return "discipline.violation.recorded" }

// ViolationVoided is ViolationRecorded's counterpart for a voided record.
type ViolationVoided struct {
	TenantID      uuid.UUID
	StudentUserID uuid.UUID
}

func (ViolationVoided) EventName() string { return "discipline.violation.voided" }

// publishInTx publishes evt from inside the caller's transaction, wrapped
// in a savepoint. Subscribers (the notification bridge writing a
// counselor's inbox row) then commit together with the write that caused
// the event, while a subscriber that fails or panics is rolled back on its
// own and never turns an already valid write into an error: the request
// answers with its real outcome, so nobody retries and records it twice.
func (s *Service) publishInTx(ctx context.Context, evt interface{ EventName() string }) {
	if s.events == nil {
		return
	}
	_ = database.WithSavepoint(ctx, func(ctx context.Context) error {
		return s.events.Publish(ctx, evt)
	})
}
