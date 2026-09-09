package authz

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type fakeProvider struct {
	perms Set
	err   error
}

func (f fakeProvider) EffectivePermissions(context.Context, uuid.UUID, uuid.UUID) (Set, error) {
	return f.perms, f.err
}

func opsWith(operationID, perm string) OperationPermissions {
	return OperationPermissions{byOperation: map[string]string{operationID: perm}, publicOps: map[string]bool{}}
}

func TestAuthorize_KeyPermissionsNeverExceedUserPermissions(t *testing.T) {
	ops := opsWith("createAPIKey", "manage_integrations")
	provider := fakeProvider{perms: NewSet("manage_integrations", "view_dashboard")}
	id := Identity{Authenticated: true, UserID: uuid.New(), TenantID: uuid.New()}

	t.Run("session identity uses the full user permission set", func(t *testing.T) {
		if err := Authorize(context.Background(), ops, provider, "createAPIKey", id); err != nil {
			t.Fatalf("expected allow, got %v", err)
		}
	})

	t.Run("a key granted the operation's permission is allowed", func(t *testing.T) {
		keyID := id
		granted := NewSet("manage_integrations")
		keyID.KeyPermissions = &granted
		if err := Authorize(context.Background(), ops, provider, "createAPIKey", keyID); err != nil {
			t.Fatalf("expected allow, got %v", err)
		}
	})

	t.Run("a key restricted to a narrower subset is forbidden even though the user has the permission", func(t *testing.T) {
		keyID := id
		granted := NewSet("view_dashboard")
		keyID.KeyPermissions = &granted
		err := Authorize(context.Background(), ops, provider, "createAPIKey", keyID)
		if !errors.Is(err, httpx.ErrForbidden) {
			t.Fatalf("expected ErrForbidden, got %v", err)
		}
	})

	t.Run("a revoked key whose owner lost the permission is still forbidden", func(t *testing.T) {
		limitedProvider := fakeProvider{perms: NewSet("view_dashboard")}
		keyID := id
		granted := NewSet("manage_integrations")
		keyID.KeyPermissions = &granted
		err := Authorize(context.Background(), ops, limitedProvider, "createAPIKey", keyID)
		if !errors.Is(err, httpx.ErrForbidden) {
			t.Fatalf("expected ErrForbidden, got %v", err)
		}
	})
}
