package wiring

import (
	"context"

	"github.com/google/uuid"

	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

// GuardianLinks implements permits/service.GuardianLinks over identity's
// existing parent-link reader (identity/service.Service's MyChildren and
// GuardiansOf) so permits never queries identity's parent_students table
// directly, per docs/03-layered-architecture.md.
type GuardianLinks struct{ Identity *identityservice.Service }

// IsApprovingGuardianOf reports whether guardianUserID is linked to
// studentUserID with can_approve_leave set, by reusing identity's
// GuardiansOf(studentUserID) reader rather than a new query.
func (g GuardianLinks) IsApprovingGuardianOf(ctx context.Context, tenantID, guardianUserID, studentUserID uuid.UUID) (bool, error) {
	guardians, err := g.Identity.GuardiansOf(ctx, tenantID, studentUserID)
	if err != nil {
		return false, err
	}
	for _, guardian := range guardians {
		if guardian.ParentUserID == guardianUserID && guardian.CanApproveLeave {
			return true, nil
		}
	}
	return false, nil
}

// ApprovingChildrenOf returns the student user IDs guardianUserID holds
// leave-approval rights for, by reusing identity's MyChildren reader.
func (g GuardianLinks) ApprovingChildrenOf(ctx context.Context, tenantID, guardianUserID uuid.UUID) ([]uuid.UUID, error) {
	children, err := g.Identity.MyChildren(ctx, tenantID, guardianUserID)
	if err != nil {
		return nil, err
	}
	out := make([]uuid.UUID, 0, len(children))
	for _, child := range children {
		if child.CanApproveLeave {
			out = append(out, child.StudentUserID)
		}
	}
	return out, nil
}
