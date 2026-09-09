package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// CreateKeyInput is what a school administrator submits to issue a key.
type CreateKeyInput struct {
	Name               string
	Permissions        []string
	IPAllowlist        []string
	RateLimitPerMinute int
	ExpiresAt          *time.Time
}

// CreatedKey carries the plaintext token alongside the stored entity: the
// only moment the token exists outside its hash.
type CreatedKey struct {
	Key   domain.APIKey
	Token string
}

// CreateKey issues a new key. Its permission subset can never exceed
// creatorUserID's own effective permissions at this moment -- checked here,
// against the same PermissionsProvider platform/authz.Authorize uses, so a
// key can never be a privilege-escalation path.
func (s *Service) CreateKey(ctx context.Context, tenantID, creatorUserID uuid.UUID, in CreateKeyInput) (CreatedKey, error) {
	if in.Name == "" || len(in.Name) > domain.MaxKeyNameLength {
		return CreatedKey{}, fmt.Errorf("%w: name", domain.ErrInvalidInput)
	}
	if len(in.Permissions) == 0 {
		return CreatedKey{}, fmt.Errorf("%w: permissions", domain.ErrInvalidInput)
	}
	if err := domain.ValidateIPAllowlist(in.IPAllowlist); err != nil {
		return CreatedKey{}, err
	}
	if err := validatePermissionCodes(in.Permissions); err != nil {
		return CreatedKey{}, err
	}

	granterPerms, err := s.perms.EffectivePermissions(ctx, tenantID, creatorUserID)
	if err != nil {
		return CreatedKey{}, fmt.Errorf("resolve creator permissions: %w", err)
	}
	if err := requireSubset(in.Permissions, granterPerms); err != nil {
		return CreatedKey{}, err
	}

	secret, err := auth.NewRandomPassword()
	if err != nil {
		return CreatedKey{}, fmt.Errorf("generate api key secret: %w", err)
	}
	secretHash, err := auth.HashPassword(secret)
	if err != nil {
		return CreatedKey{}, fmt.Errorf("hash api key secret: %w", err)
	}

	key := domain.APIKey{
		ID:                 uuid.Must(uuid.NewV7()),
		TenantID:           tenantID,
		Name:               in.Name,
		SecretHash:         secretHash,
		Permissions:        in.Permissions,
		CreatedBy:          creatorUserID,
		IPAllowlist:        in.IPAllowlist,
		RateLimitPerMinute: domain.ClampRateLimit(in.RateLimitPerMinute),
		ExpiresAt:          in.ExpiresAt,
	}

	var created domain.APIKey
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		created, err = s.keys.CreateKey(ctx, key)
		return err
	})
	if err != nil {
		return CreatedKey{}, fmt.Errorf("create api key: %w", err)
	}

	return CreatedKey{Key: created, Token: auth.NewAPIKeyToken(key.ID, secret)}, nil
}

func (s *Service) ListKeys(ctx context.Context, tenantID uuid.UUID) ([]domain.APIKey, error) {
	var keys []domain.APIKey
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		keys, err = s.keys.ListKeys(ctx, tenantID)
		return err
	})
	return keys, err
}

// RevokeKey disables a key immediately: the next request presenting it
// fails authentication before authz is ever consulted.
func (s *Service) RevokeKey(ctx context.Context, tenantID, keyID uuid.UUID) (domain.APIKey, error) {
	var revoked domain.APIKey
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, err := s.keys.GetKey(ctx, tenantID, keyID)
		if err != nil {
			return err
		}
		if existing.RevokedAt != nil {
			return domain.ErrKeyAlreadyRevoked
		}
		revoked, err = s.keys.RevokeKey(ctx, tenantID, keyID, s.clock.Now())
		return err
	})
	return revoked, err
}

// validatePermissionCodes rejects any code that is not in the static
// permission catalog, so a typo does not silently create a key with a
// permission nothing ever checks.
func validatePermissionCodes(codes []string) error {
	valid := authz.NewSet(authz.Codes()...)
	for _, c := range codes {
		if !valid.Has(c) {
			return fmt.Errorf("%w: unknown permission %q", domain.ErrInvalidInput, c)
		}
	}
	return nil
}

// requireSubset is the rule the task calls out explicitly: a key's
// permissions can never exceed what its creator holds themself.
func requireSubset(requested []string, granted authz.Set) error {
	for _, p := range requested {
		if !granted.Has(p) {
			return domain.ErrKeyPermissionExceeds
		}
	}
	return nil
}
