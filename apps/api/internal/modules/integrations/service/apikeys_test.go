package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// fakePermissionsProvider returns a fixed set for any user, standing in for
// identity's service in these unit tests.
type fakePermissionsProvider struct {
	perms authz.Set
	err   error
}

func (f fakePermissionsProvider) EffectivePermissions(context.Context, uuid.UUID, uuid.UUID) (authz.Set, error) {
	return f.perms, f.err
}

// panicKeyRepository fails the test loudly if CreateKey ever reaches
// persistence: several cases below must be rejected purely on validation,
// before any repository or pool is touched.
type panicKeyRepository struct{ KeyRepository }

func (panicKeyRepository) CreateKey(context.Context, domain.APIKey) (domain.APIKey, error) {
	panic("CreateKey should not have been called: validation should have rejected the request first")
}

func newTestService(perms authz.Set, permsErr error) *Service {
	return New(nil, panicKeyRepository{}, nil, fakePermissionsProvider{perms: perms, err: permsErr}, nil, nil, clock.Frozen{At: time.Unix(0, 0)}, nil)
}

func TestCreateKey_PermissionSubsetNeverExceedsCreator(t *testing.T) {
	t.Run("requesting a permission the creator does not hold is rejected", func(t *testing.T) {
		svc := newTestService(authz.NewSet(authz.PermViewIntegrations), nil)
		_, err := svc.CreateKey(context.Background(), uuid.New(), uuid.New(), CreateKeyInput{
			Name: "CI pipeline", Permissions: []string{authz.PermManageIntegrations},
		})
		if !errors.Is(err, domain.ErrKeyPermissionExceeds) {
			t.Fatalf("expected ErrKeyPermissionExceeds, got %v", err)
		}
	})

	t.Run("requesting a permission the creator holds among others also requested is rejected as a whole", func(t *testing.T) {
		svc := newTestService(authz.NewSet(authz.PermViewIntegrations), nil)
		_, err := svc.CreateKey(context.Background(), uuid.New(), uuid.New(), CreateKeyInput{
			Name: "CI pipeline", Permissions: []string{authz.PermViewIntegrations, authz.PermManageIntegrations},
		})
		if !errors.Is(err, domain.ErrKeyPermissionExceeds) {
			t.Fatalf("expected ErrKeyPermissionExceeds when any requested permission exceeds the creator's, got %v", err)
		}
	})

	t.Run("an unknown permission code is rejected before the subset check even runs", func(t *testing.T) {
		svc := newTestService(authz.NewSet(authz.Codes()...), nil)
		_, err := svc.CreateKey(context.Background(), uuid.New(), uuid.New(), CreateKeyInput{
			Name: "CI pipeline", Permissions: []string{"not_a_real_permission"},
		})
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Fatalf("expected ErrInvalidInput for an unknown permission code, got %v", err)
		}
	})

	t.Run("an empty name is rejected", func(t *testing.T) {
		svc := newTestService(authz.NewSet(authz.Codes()...), nil)
		_, err := svc.CreateKey(context.Background(), uuid.New(), uuid.New(), CreateKeyInput{
			Permissions: []string{authz.PermViewIntegrations},
		})
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Fatalf("expected ErrInvalidInput for an empty name, got %v", err)
		}
	})

	t.Run("an invalid ip allowlist entry is rejected", func(t *testing.T) {
		svc := newTestService(authz.NewSet(authz.Codes()...), nil)
		_, err := svc.CreateKey(context.Background(), uuid.New(), uuid.New(), CreateKeyInput{
			Name: "CI pipeline", Permissions: []string{authz.PermViewIntegrations}, IPAllowlist: []string{"not-an-ip"},
		})
		if !errors.Is(err, domain.ErrInvalidInput) {
			t.Fatalf("expected ErrInvalidInput for an invalid ip allowlist entry, got %v", err)
		}
	})

	t.Run("a failure resolving the creator's own permissions is surfaced, not swallowed", func(t *testing.T) {
		svc := newTestService(nil, errors.New("identity lookup failed"))
		_, err := svc.CreateKey(context.Background(), uuid.New(), uuid.New(), CreateKeyInput{
			Name: "CI pipeline", Permissions: []string{authz.PermViewIntegrations},
		})
		if err == nil {
			t.Fatal("expected an error")
		}
	})
}
