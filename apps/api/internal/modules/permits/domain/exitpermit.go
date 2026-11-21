package domain

import (
	"time"

	"github.com/google/uuid"
)

// ExitPermit is one exit_permits row, 1:1 with a workflow_instances row of
// kind exit_permit. IssuedAt is set once every approval stage has passed
// (the instance moves to StatusApproved); ExitedAt is set once security
// scans the gate token (the instance moves to StatusCompleted, which ends
// the approval chain).
//
// The student's return is a fact on the permit, not a workflow stage:
// ReturnRequired is chosen with the request (false when the student goes
// home), ExpectedReturnAt is the end of the permit's last lesson period on
// the exit day, stored at the gate scan, and ReturnedAt is set when
// security records the student back through the gate.
type ExitPermit struct {
	InstanceID           uuid.UUID
	TenantID             uuid.UUID
	Destination          string
	StartPeriodID        uuid.UUID
	EndPeriodID          uuid.UUID
	IssuedAt             *time.Time
	GateTokenID          uuid.NullUUID
	ExitedAt             *time.Time
	SecurityUserID       uuid.NullUUID
	StudentNameSnapshot  string
	ClassNameSnapshot    string
	ReturnRequired       bool
	ExpectedReturnAt     *time.Time
	ReturnedAt           *time.Time
	ReturnSecurityUserID uuid.NullUUID
}

func (p ExitPermit) IsIssued() bool { return p.IssuedAt != nil }

func (p ExitPermit) HasExited() bool { return p.ExitedAt != nil }

// AwaitingReturn reports whether the student left through the gate, is
// expected back by a tracked time, and has not been recorded back yet. A
// permit that exited before returns were tracked (or was imported from
// SION) has no ExpectedReturnAt and is never awaited: whether that student
// came back is unknown.
func (p ExitPermit) AwaitingReturn() bool {
	return p.ExitedAt != nil && p.ReturnRequired && p.ExpectedReturnAt != nil && p.ReturnedAt == nil
}

// IsOverdue reports whether the student is still out after the time they
// were due back.
func (p ExitPermit) IsOverdue(now time.Time) bool {
	return p.AwaitingReturn() && now.After(*p.ExpectedReturnAt)
}

// ReturnedLate reports whether the recorded return came after the time the
// student was due back.
func (p ExitPermit) ReturnedLate() bool {
	return p.ReturnedAt != nil && p.ExpectedReturnAt != nil && p.ReturnedAt.After(*p.ExpectedReturnAt)
}

// ExitPermitReadStatus is the status an exit permit reads as on the school
// day today (a tenant-local instant on the business clock). A permit opened
// on localDate (Instance.LocalDate) and still in progress, or approved and
// never taken through the gate, cannot go on once its own day is over: its
// lessons are past and the gate refuses it (ErrExitPermitWindowClosed). The
// expiry job closes such a permit after midnight on the real clock, so it
// reads as expired from the next day on, before the job has run and on a
// simulated later day the job never sees.
func ExitPermitReadStatus(status Status, localDate, today time.Time) Status {
	if status != StatusInProgress && status != StatusApproved {
		return status
	}
	if localDate.Format(time.DateOnly) < today.Format(time.DateOnly) {
		return StatusExpired
	}
	return status
}
