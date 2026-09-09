package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// Authenticate implements platform/auth.APIKeyLookup: it is how
// Authenticator.Middleware resolves a "nsk_..." bearer token into the same
// kind of authenticated identity a session produces. Every failure maps to
// one of platform/auth's sentinel errors so the middleware's mapping to an
// httpx.Error stays in one place.
func (s *Service) Authenticate(ctx context.Context, tenantID uuid.UUID, rawKey, ip string) (auth.APIKeyPrincipal, error) {
	keyID, secret, ok := auth.ParseAPIKeyToken(rawKey)
	if !ok {
		return auth.APIKeyPrincipal{}, auth.ErrAPIKeyNotFound
	}

	var (
		principal auth.APIKeyPrincipal
		outerErr  error
	)
	// A failed lookup must not fail authentication with an internal error:
	// withTx would otherwise turn "wrong tenant" or "not found" into a
	// rolled-back-transaction error indistinguishable from a real outage.
	// Every expected outcome below is therefore returned as outerErr and
	// the closure itself always returns nil so the (harmless) read-only
	// transaction commits normally.
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		key, err := s.keys.GetKey(ctx, tenantID, keyID)
		if err != nil {
			outerErr = auth.ErrAPIKeyNotFound
			return nil
		}
		if key.RevokedAt != nil {
			outerErr = auth.ErrAPIKeyRevoked
			return nil
		}
		now := s.clock.Now()
		if !key.Active(now) {
			outerErr = auth.ErrAPIKeyExpired
			return nil
		}
		if verifyErr := auth.VerifyPassword(key.SecretHash, secret); verifyErr != nil {
			outerErr = auth.ErrAPIKeyNotFound
			return nil
		}
		if !key.IPAllowed(ip) {
			outerErr = auth.ErrAPIKeyIPNotAllowed
			return nil
		}

		if touchErr := s.keys.TouchKeyLastUsed(ctx, tenantID, key.ID, now); touchErr != nil {
			return fmt.Errorf("touch api key last used: %w", touchErr)
		}

		principal = auth.APIKeyPrincipal{
			KeyID:              key.ID,
			KeyName:            key.Name,
			OwnerUserID:        key.CreatedBy,
			Permissions:        authz.NewSet(key.Permissions...),
			RateLimitPerMinute: int64(key.RateLimitPerMinute),
		}
		return nil
	})
	if err != nil {
		return auth.APIKeyPrincipal{}, fmt.Errorf("authenticate api key: %w", err)
	}
	if outerErr != nil {
		return auth.APIKeyPrincipal{}, outerErr
	}
	return principal, nil
}
