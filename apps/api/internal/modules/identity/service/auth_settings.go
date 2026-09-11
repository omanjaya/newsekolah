package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
)

// AuthSettings returns the tenant's session policy (admin-facing read).
func (s *Service) AuthSettings(ctx context.Context, tenantID uuid.UUID) (domain.AuthSettings, error) {
	var out domain.AuthSettings
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.GetAuthSettings(ctx, tenantID)
		return err
	})
	return out, err
}

// sessionTTL is the tenant's configured refresh-token lifetime
// (auth.session_days). Every login path (password, passkey, Google SSO)
// and refresh rotation uses this instead of the deployment-wide
// REFRESH_TOKEN_TTL default, so a school can tighten or loosen it without
// a redeploy.
func (s *Service) sessionTTL(ctx context.Context, tenantID uuid.UUID) (time.Duration, error) {
	settings, err := s.repo.GetAuthSettings(ctx, tenantID)
	if err != nil {
		return 0, err
	}
	return time.Duration(settings.SessionDays) * 24 * time.Hour, nil
}

// UpdateAuthSettings validates and stores a new session policy.
func (s *Service) UpdateAuthSettings(ctx context.Context, tenantID, actorID uuid.UUID, in domain.AuthSettings) (domain.AuthSettings, error) {
	if err := domain.ValidateAuthSettings(in); err != nil {
		return domain.AuthSettings{}, err
	}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.SetAuthSettings(ctx, tenantID, actorID, in)
	})
	return in, err
}
