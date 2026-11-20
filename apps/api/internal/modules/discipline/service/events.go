package service

import "github.com/google/uuid"

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
