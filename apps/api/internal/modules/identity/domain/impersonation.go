package domain

import "github.com/google/uuid"

// ImpersonationTarget is the subset of a user's admin-relevant state needed
// to decide whether they can be impersonated.
type ImpersonationTarget struct {
	ID           uuid.UUID
	Status       UserStatus
	IsSuperAdmin bool
}

// ValidateImpersonationTarget enforces docs/08-security.md section 2 and
// docs/analysis/backend-inventory.md section 1.2: an admin cannot
// impersonate themselves, a super_admin can never be impersonated (by
// anyone, since only super_admin itself would have equal standing and
// impersonating a peer admin defeats the point of audit attribution), and
// only an active target can be impersonated.
func ValidateImpersonationTarget(actorID uuid.UUID, target ImpersonationTarget) error {
	if actorID == target.ID {
		return ErrCannotImpersonateSelf
	}
	if target.IsSuperAdmin {
		return ErrCannotImpersonateSuperAdmin
	}
	if target.Status != UserActive {
		return ErrCannotImpersonateInactive
	}
	return nil
}
