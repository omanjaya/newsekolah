package wiring

import (
	"context"
	"errors"

	"github.com/google/uuid"

	disciplinedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
)

// The action inbox is always on, but every queue it counts belongs to a
// toggleable module. A queue whose module is turned off counts as 0: its
// items stay where they are, but nobody can act on them (the module's own
// endpoints answer MODULE_DISABLED), so the badge must not point at them.

// InboxWarningLetters adapts discipline's due-candidate count to the inbox
// port, treating a tenant with no active academic year as "nothing due"
// (the candidates screen reports that as a conflict; a badge should not),
// and a tenant with discipline turned off as "nothing due" too.
type InboxWarningLetters struct {
	Svc *disciplineservice.Service
	// Flags reads the discipline feature flag; nil leaves discipline on.
	Flags ModuleFlagReader
}

func (w InboxWarningLetters) CountDueSPCandidates(ctx context.Context, tenantID uuid.UUID) (int, error) {
	if on, err := moduleEnabled(ctx, w.Flags, tenantID, platformdomain.ModuleDiscipline); err != nil || !on {
		return 0, err
	}
	n, err := w.Svc.CountDueSPCandidates(ctx, tenantID)
	if errors.Is(err, disciplinedomain.ErrNoActiveAcademicYear) {
		return 0, nil
	}
	return n, err
}

// InboxPermitsQueues is the permits service's three inbox counters.
type InboxPermitsQueues interface {
	CountLeaveRequestsForReview(ctx context.Context, tenantID, reviewerUserID uuid.UUID) (int, error)
	CountExitPermitsForApproval(ctx context.Context, tenantID, callerUserID uuid.UUID) (int, error)
	CountLateArrivalsForReview(ctx context.Context, tenantID, callerUserID uuid.UUID) (int, error)
}

// InboxPermits serves the inbox's leave, exit-permit and late-arrival
// counters, each 0 while the tenant has permits turned off.
type InboxPermits struct {
	Queues InboxPermitsQueues
	// Flags reads the permits feature flag; nil leaves permits on.
	Flags ModuleFlagReader
}

func (p InboxPermits) CountLeaveRequestsForReview(ctx context.Context, tenantID, reviewerUserID uuid.UUID) (int, error) {
	if on, err := moduleEnabled(ctx, p.Flags, tenantID, platformdomain.ModulePermits); err != nil || !on {
		return 0, err
	}
	return p.Queues.CountLeaveRequestsForReview(ctx, tenantID, reviewerUserID)
}

func (p InboxPermits) CountExitPermitsForApproval(ctx context.Context, tenantID, callerUserID uuid.UUID) (int, error) {
	if on, err := moduleEnabled(ctx, p.Flags, tenantID, platformdomain.ModulePermits); err != nil || !on {
		return 0, err
	}
	return p.Queues.CountExitPermitsForApproval(ctx, tenantID, callerUserID)
}

func (p InboxPermits) CountLateArrivalsForReview(ctx context.Context, tenantID, callerUserID uuid.UUID) (int, error) {
	if on, err := moduleEnabled(ctx, p.Flags, tenantID, platformdomain.ModulePermits); err != nil || !on {
		return 0, err
	}
	return p.Queues.CountLateArrivalsForReview(ctx, tenantID, callerUserID)
}
