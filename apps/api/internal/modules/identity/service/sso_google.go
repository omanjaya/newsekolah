package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/oidc"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// GoogleSSOConfig is one tenant's Google Workspace SSO setup. ClientSecret
// is never populated by a read: it stays sealed in the repository and the
// admin screen only ever writes a new one, matching how the TOTP secret
// is handled.
type GoogleSSOConfig struct {
	TenantID     uuid.UUID
	ClientID     string
	HostedDomain string
	Enabled      bool
}

// SSORepository is the Google SSO configuration slice of the identity
// repository.
type SSORepository interface {
	GetGoogleSSOConfig(ctx context.Context, tenantID uuid.UUID) (config GoogleSSOConfig, clientSecretEncrypted []byte, err error)
	UpsertGoogleSSOConfig(ctx context.Context, tenantID uuid.UUID, clientID string, clientSecretEncrypted []byte, hostedDomain string, enabled bool) (GoogleSSOConfig, error)
	DeleteGoogleSSOConfig(ctx context.Context, tenantID uuid.UUID) error
}

// GoogleIDTokenVerifier checks a Google ID token's signature and standard
// claims. Production wiring uses oidc.VerifyIDToken against Google's
// published keys (module.go); tests substitute a fake.
type GoogleIDTokenVerifier interface {
	Verify(ctx context.Context, idToken, audience, hostedDomain string) (oidc.Claims, error)
}

// GoogleSSOInput is what the admin screen submits to configure or update
// Google SSO for a tenant. An empty ClientSecret on an update leaves the
// currently stored secret untouched, so re-saving the hosted domain does
// not require re-entering it.
type GoogleSSOInput struct {
	ClientID     string
	ClientSecret string
	HostedDomain string
	Enabled      bool
}

// GetGoogleSSOConfig returns the tenant's Google SSO configuration for the
// admin screen. ok is false when nothing has been configured yet.
func (s *Service) GetGoogleSSOConfig(ctx context.Context, tenantID uuid.UUID) (config GoogleSSOConfig, ok bool, err error) {
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		cfg, _, getErr := s.repo.GetGoogleSSOConfig(ctx, tenantID)
		if getErr != nil {
			if errors.Is(getErr, pgx.ErrNoRows) {
				return nil
			}
			return getErr
		}
		config, ok = cfg, true
		return nil
	})
	return config, ok, err
}

// GoogleSSOAvailability is what the (unauthenticated) login screen is
// allowed to know before anyone has signed in: whether to show the button,
// and the OAuth client id it needs to initialize Google Identity Services
// in the browser. The client id is not a secret.
type GoogleSSOAvailability struct {
	Enabled  bool
	ClientID string
}

// GetGoogleSSOAvailability answers the login screen's "should I show the
// Google button" check.
func (s *Service) GetGoogleSSOAvailability(ctx context.Context, tenantID uuid.UUID) (GoogleSSOAvailability, error) {
	cfg, ok, err := s.GetGoogleSSOConfig(ctx, tenantID)
	if err != nil || !ok || !cfg.Enabled {
		return GoogleSSOAvailability{}, err
	}
	return GoogleSSOAvailability{Enabled: true, ClientID: cfg.ClientID}, nil
}

// SetGoogleSSOConfig creates or replaces the tenant's Google SSO
// configuration. The client secret is sealed with the platform sealer
// before it ever reaches the repository.
func (s *Service) SetGoogleSSOConfig(ctx context.Context, tenantID uuid.UUID, in GoogleSSOInput) (GoogleSSOConfig, error) {
	if s.extras.SSOSealer == nil {
		return GoogleSSOConfig{}, domain.ErrSSONotConfigured
	}

	var result GoogleSSOConfig
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		secretEncrypted, err := s.googleSSOSecretToStore(ctx, tenantID, in.ClientSecret)
		if err != nil {
			return err
		}

		cfg, err := s.repo.UpsertGoogleSSOConfig(ctx, tenantID, in.ClientID, secretEncrypted, in.HostedDomain, in.Enabled)
		if err != nil {
			return fmt.Errorf("upsert google sso config: %w", err)
		}
		result = cfg

		return audit.Record(ctx, tenantID, "sso_google.configure", "sso_google_config", tenantID, nil, map[string]any{
			"client_id":     cfg.ClientID,
			"hosted_domain": cfg.HostedDomain,
			"enabled":       cfg.Enabled,
		})
	})
	return result, err
}

// googleSSOSecretToStore seals a freshly submitted secret, or -- when the
// admin screen submitted an empty secret to mean "keep the current one"
// -- re-reads and re-returns the ciphertext already on file.
func (s *Service) googleSSOSecretToStore(ctx context.Context, tenantID uuid.UUID, plaintext string) ([]byte, error) {
	if plaintext != "" {
		sealed, err := s.extras.SSOSealer.Seal([]byte(plaintext))
		if err != nil {
			return nil, fmt.Errorf("seal google client secret: %w", err)
		}
		return sealed, nil
	}
	_, existing, err := s.repo.GetGoogleSSOConfig(ctx, tenantID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrSSOClientSecretRequired
		}
		return nil, fmt.Errorf("load existing google sso config: %w", err)
	}
	return existing, nil
}

// DeleteGoogleSSOConfig removes the tenant's Google SSO configuration.
func (s *Service) DeleteGoogleSSOConfig(ctx context.Context, tenantID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.repo.DeleteGoogleSSOConfig(ctx, tenantID); err != nil {
			return fmt.Errorf("delete google sso config: %w", err)
		}
		return audit.RecordSimple(ctx, tenantID, "sso_google.remove", "sso_google_config", tenantID)
	})
}

// GoogleLoginInput mirrors LoginInput for the Google SSO sign-in path.
type GoogleLoginInput struct {
	TenantID   uuid.UUID
	IDToken    string
	Client     domain.ClientKind
	DeviceID   string
	DeviceName string
	IP         string
	UserAgent  string
}

// GoogleLogin verifies a Google ID token and, when it matches an existing
// active user's email, opens the same kind of session Login does. It
// never creates a user: an unmatched email is rejected, not provisioned,
// because school accounts are always created by an administrator first
// (docs/12-roadmap.md, Fase 5).
func (s *Service) GoogleLogin(ctx context.Context, in GoogleLoginInput) (AuthResult, error) {
	if s.googleVerifier == nil {
		return AuthResult{}, domain.ErrSSONotConfigured
	}

	var result AuthResult
	err := s.withTx(ctx, in.TenantID, func(ctx context.Context) error {
		cfg, _, err := s.repo.GetGoogleSSOConfig(ctx, in.TenantID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.ErrSSONotConfigured
			}
			return fmt.Errorf("load google sso config: %w", err)
		}
		if !cfg.Enabled {
			return domain.ErrSSONotConfigured
		}

		claims, err := s.googleVerifier.Verify(ctx, in.IDToken, cfg.ClientID, cfg.HostedDomain)
		if err != nil {
			return domain.ErrSSOInvalidToken
		}

		user, found, err := s.repo.GetUserByUsernameOrEmail(ctx, in.TenantID, domain.NormalizeEmail(claims.Email))
		if err != nil {
			return fmt.Errorf("look up sso user: %w", err)
		}
		if !found {
			return domain.ErrSSOAccountNotFound
		}
		if !user.CanAuthenticate() {
			return domain.ErrAccountNotActive
		}

		// Same bookkeeping the password path writes on a successful
		// attempt (service/auth.go's login): a login_attempts row and the
		// user's last_login_at, so this sign-in path is indistinguishable
		// from password login in the audit trail and the login-attempt
		// history an account lockout policy would read.
		now := s.clock.Now()
		_ = s.repo.RecordLoginAttempt(ctx, in.TenantID, user.Username, in.IP, true)
		_ = s.repo.UpdateLastLogin(ctx, in.TenantID, user.ID, now)

		session, refreshToken, err := s.openSession(ctx, user, uuid.New(), in.Client, in.DeviceID, in.DeviceName, in.UserAgent, in.IP, now)
		if err != nil {
			return err
		}

		result, err = s.buildAuthResult(ctx, user, session, refreshToken, now)
		return err
	})
	return result, err
}
