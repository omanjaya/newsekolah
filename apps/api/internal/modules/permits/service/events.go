package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

// Domain events published via platform/events.Bus (see scope item 6):
// permits only publishes; it does not send notifications itself. Each
// type's EventName is what a handler subscribes to.

type LeaveRequestSubmitted struct {
	TenantID      uuid.UUID
	InstanceID    uuid.UUID
	StudentUserID uuid.UUID
	ClassID       uuid.NullUUID
}

func (LeaveRequestSubmitted) EventName() string { return "permits.leave_request.submitted" }

type LeaveRequestReviewed struct {
	TenantID      uuid.UUID
	InstanceID    uuid.UUID
	StudentUserID uuid.UUID
	Approved      bool
	ReviewerID    uuid.UUID
}

func (LeaveRequestReviewed) EventName() string { return "permits.leave_request.reviewed" }

type LeaveRequestIssued struct {
	TenantID      uuid.UUID
	InstanceID    uuid.UUID
	StudentUserID uuid.UUID
	LetterNumber  string
}

func (LeaveRequestIssued) EventName() string { return "permits.leave_request.issued" }

type ExitPermitStageChanged struct {
	TenantID      uuid.UUID
	InstanceID    uuid.UUID
	StudentUserID uuid.UUID
	StageKey      string
}

func (ExitPermitStageChanged) EventName() string { return "permits.exit_permit.stage_changed" }

type ExitPermitIssued struct {
	TenantID      uuid.UUID
	InstanceID    uuid.UUID
	StudentUserID uuid.UUID
}

func (ExitPermitIssued) EventName() string { return "permits.exit_permit.issued" }

type ExitPermitExited struct {
	TenantID       uuid.UUID
	InstanceID     uuid.UUID
	StudentUserID  uuid.UUID
	SecurityUserID uuid.UUID
}

func (ExitPermitExited) EventName() string { return "permits.exit_permit.exited" }

type LateArrivalOpened struct {
	TenantID      uuid.UUID
	InstanceID    uuid.UUID
	StudentUserID uuid.UUID
	ClassID       uuid.NullUUID
}

func (LateArrivalOpened) EventName() string { return "permits.late_arrival.opened" }

type LateArrivalUpdated struct {
	TenantID      uuid.UUID
	InstanceID    uuid.UUID
	StudentUserID uuid.UUID
	Status        string
}

func (LateArrivalUpdated) EventName() string { return "permits.late_arrival.updated" }

// publish is a small helper so every service file does not repeat the
// "publish, but a subscriber error must not roll back the transaction it
// happened alongside" decision -- in-process handlers here are expected to
// be fast and best-effort (real notification delivery goes through a
// River job the handler enqueues), so a publish error is logged by the
// caller of Service, not turned into the use case's own error.
func (s *Service) publish(ctx context.Context, evt events.Event) {
	if s.events == nil {
		return
	}
	_ = s.events.Publish(ctx, evt)
}
