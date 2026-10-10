// Package service aggregates the action-inbox counts. It is a thin
// cross-module read: each count is delegated to the module that owns the
// queue, so the numbers can never drift from what the queue lists.
package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// PermissionReader is identity's effective-permission lookup.
type PermissionReader interface {
	EffectivePermissions(ctx context.Context, tenantID, userID uuid.UUID) (authz.Set, error)
}

// The counters mirror the queue endpoints. Leave and warning letters sit
// behind a permission (review_leave_requests, issue_warning_letters). The
// exit and late-arrival queues are open to any authenticated caller and
// scoped inside the query (duty assignments, the opening teacher), so their
// counters are called for everyone and return 0 when nothing is theirs.

type LeaveCounter interface {
	CountLeaveRequestsForReview(ctx context.Context, tenantID, reviewerUserID uuid.UUID) (int, error)
}

type ExitCounter interface {
	CountExitPermitsForApproval(ctx context.Context, tenantID, callerUserID uuid.UUID) (int, error)
}

type LateCounter interface {
	CountLateArrivalsForReview(ctx context.Context, tenantID, callerUserID uuid.UUID) (int, error)
}

type WarningLetterCounter interface {
	CountDueSPCandidates(ctx context.Context, tenantID uuid.UUID) (int, error)
}

// Caller is who is asking. KeyPermissions is set only for API-key requests,
// where it caps the owning user's permissions (see authz.Identity).
type Caller struct {
	TenantID       uuid.UUID
	UserID         uuid.UUID
	KeyPermissions *authz.Set
}

// Counts is what the caller can act on, per queue.
type Counts struct {
	Leave          int
	Exit           int
	Late           int
	WarningLetters int
}

func (c Counts) Total() int { return c.Leave + c.Exit + c.Late + c.WarningLetters }

type Service struct {
	perms          PermissionReader
	leave          LeaveCounter
	exit           ExitCounter
	late           LateCounter
	warningLetters WarningLetterCounter
}

func New(perms PermissionReader, leave LeaveCounter, exit ExitCounter, late LateCounter, warningLetters WarningLetterCounter) *Service {
	return &Service{perms: perms, leave: leave, exit: exit, late: late, warningLetters: warningLetters}
}

// Counts returns the caller's pending counts. A queue gated by a permission
// the caller lacks counts as 0 without touching its module.
func (s *Service) Counts(ctx context.Context, caller Caller) (Counts, error) {
	perms, err := s.perms.EffectivePermissions(ctx, caller.TenantID, caller.UserID)
	if err != nil {
		return Counts{}, fmt.Errorf("load permissions: %w", err)
	}
	can := func(code string) bool {
		return perms.Has(code) && (caller.KeyPermissions == nil || caller.KeyPermissions.Has(code))
	}

	var out Counts
	if can(authz.PermReviewLeaveRequests) {
		if out.Leave, err = s.leave.CountLeaveRequestsForReview(ctx, caller.TenantID, caller.UserID); err != nil {
			return Counts{}, fmt.Errorf("count leave requests: %w", err)
		}
	}
	if out.Exit, err = s.exit.CountExitPermitsForApproval(ctx, caller.TenantID, caller.UserID); err != nil {
		return Counts{}, fmt.Errorf("count exit permits: %w", err)
	}
	if out.Late, err = s.late.CountLateArrivalsForReview(ctx, caller.TenantID, caller.UserID); err != nil {
		return Counts{}, fmt.Errorf("count late arrivals: %w", err)
	}
	if can(authz.PermIssueWarningLetters) {
		if out.WarningLetters, err = s.warningLetters.CountDueSPCandidates(ctx, caller.TenantID); err != nil {
			return Counts{}, fmt.Errorf("count warning letters: %w", err)
		}
	}
	return out, nil
}
