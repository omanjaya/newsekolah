package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// fakeRolePermissionRepo embeds the (nil) Repository interface so it
// satisfies every method requireLateArrivalReviewer's tests do not call.
type fakeRolePermissionRepo struct {
	Repository
	hasRolePermission bool
}

func (f fakeRolePermissionRepo) HasRolePermission(context.Context, uuid.UUID, uuid.UUID, string) (bool, error) {
	return f.hasRolePermission, nil
}

// TestRequireLateArrivalReviewer covers the three cases
// docs/analysis/backend-inventory.md 1.16 calls out: the teacher whose
// token opened the flow may always review it; a picket-duty teacher whose
// manage_attendance is duty-granted (not the opening teacher) may not; a
// role-granted manage_attendance holder (an attendance administrator, or
// super_admin) may review any flow as a fallback.
func TestRequireLateArrivalReviewer(t *testing.T) {
	openingTeacher := uuid.New()
	otherTeacher := uuid.New()
	late := domain.LateArrival{DutyTeacherUserID: uuid.NullUUID{UUID: openingTeacher, Valid: true}}

	t.Run("the teacher whose token opened the flow may review it", func(t *testing.T) {
		svc := &Service{repo: fakeRolePermissionRepo{hasRolePermission: false}}
		require.NoError(t, svc.requireLateArrivalReviewer(context.Background(), uuid.New(), openingTeacher, late))
	})

	t.Run("a different teacher without role-granted manage_attendance is refused", func(t *testing.T) {
		svc := &Service{repo: fakeRolePermissionRepo{hasRolePermission: false}}
		err := svc.requireLateArrivalReviewer(context.Background(), uuid.New(), otherTeacher, late)
		require.ErrorIs(t, err, domain.ErrLateArrivalReviewerOnly)
	})

	t.Run("a role-granted manage_attendance holder may review any flow", func(t *testing.T) {
		svc := &Service{repo: fakeRolePermissionRepo{hasRolePermission: true}}
		require.NoError(t, svc.requireLateArrivalReviewer(context.Background(), uuid.New(), otherTeacher, late))
	})

	t.Run("no recorded opening teacher still falls back to role permission", func(t *testing.T) {
		svc := &Service{repo: fakeRolePermissionRepo{hasRolePermission: true}}
		require.NoError(t, svc.requireLateArrivalReviewer(context.Background(), uuid.New(), otherTeacher, domain.LateArrival{}))
	})
}
