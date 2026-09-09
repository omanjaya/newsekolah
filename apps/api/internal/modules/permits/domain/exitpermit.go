package domain

import (
	"time"

	"github.com/google/uuid"
)

// ExitPermit is one exit_permits row, 1:1 with a workflow_instances row of
// kind exit_permit. IssuedAt is set once every approval stage has passed
// (the instance moves to StatusApproved); ExitedAt is set once security
// scans the gate token (the instance moves to StatusCompleted).
type ExitPermit struct {
	InstanceID          uuid.UUID
	TenantID            uuid.UUID
	Destination         string
	StartPeriodID       uuid.UUID
	EndPeriodID         uuid.UUID
	IssuedAt            *time.Time
	GateTokenID         uuid.NullUUID
	ExitedAt            *time.Time
	SecurityUserID      uuid.NullUUID
	StudentNameSnapshot string
	ClassNameSnapshot   string
}

func (p ExitPermit) IsIssued() bool { return p.IssuedAt != nil }

func (p ExitPermit) HasExited() bool { return p.ExitedAt != nil }
