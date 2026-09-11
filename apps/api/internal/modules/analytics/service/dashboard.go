package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

// ErrDashboardUnavailable is returned when the admin dashboard's required
// cross-module readers (identity, permits) were never wired -- a
// deployment issue, not a per-request one.
var ErrDashboardUnavailable = errors.New("admin dashboard is not available: identity/permits readers not configured")

// pendingWorkflowKinds are permits/domain.Kind's values, duplicated here
// as plain strings so this package does not import that module's domain
// package just for an enum (see PermitsReader's doc comment).
var pendingWorkflowKinds = []string{"leave_request", "exit_permit", "late_arrival"}

// AdminDashboard is the operational snapshot GET /v1/analytics/admin-
// dashboard serves: active users per profile kind, pending approval
// queues, online presence per role, and a 7-day login histogram
// (reference/sion-rebuild-go admin_dashboard.go).
type AdminDashboard struct {
	ActiveUsersByProfileKind map[string]int
	PendingByKind            map[string]int
	OnlineByRole             map[string]int
	LoginHistogramByHour     [24]int
}

// AdminDashboard composes the four panels. Restricted to admin/super_admin
// callers by the transport layer (docs/analysis/backend-inventory.md
// section 1.7: the old app's role check, not just a permission code) --
// this method itself does not know who the caller is.
func (s *Service) AdminDashboard(ctx context.Context, tenantID uuid.UUID) (AdminDashboard, error) {
	if s.identity == nil || s.permits == nil {
		return AdminDashboard{}, ErrDashboardUnavailable
	}

	activeUsers, err := s.identity.DashboardActiveUsers(ctx, tenantID)
	if err != nil {
		return AdminDashboard{}, err
	}
	histogram, err := s.identity.DashboardLoginHistogram(ctx, tenantID)
	if err != nil {
		return AdminDashboard{}, err
	}

	pending := make(map[string]int, len(pendingWorkflowKinds))
	for _, kind := range pendingWorkflowKinds {
		count, err := s.permits.PendingCount(ctx, tenantID, kind)
		if err != nil {
			return AdminDashboard{}, err
		}
		pending[kind] = count
	}

	online := map[string]int{}
	if s.presence != nil {
		if byRole, err := s.presence.OnlineByRole(ctx, tenantID); err == nil {
			online = byRole
		}
	}

	return AdminDashboard{
		ActiveUsersByProfileKind: activeUsers,
		PendingByKind:            pending,
		OnlineByRole:             online,
		LoginHistogramByHour:     histogram,
	}, nil
}
