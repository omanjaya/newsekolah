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

func (ThresholdReached) EventName() string { return "discipline.threshold_reached" }
