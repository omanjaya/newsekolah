package service

import (
	"bytes"
	"context"
	"fmt"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
)

// PasskeyLoginInput identifies which account's passkeys a login ceremony
// should be started against; the client/device/IP fields Login and
// GoogleLogin also take only matter once the ceremony finishes, so they
// live on FinishPasskeyLoginInput instead.
type PasskeyLoginInput struct {
	TenantID uuid.UUID
	Username string
}

// BeginPasskeyLogin starts a login ceremony for the named account. Per
// docs/08-security.md section 2's spirit for the password path, an
// unknown username or one with no registered passkey returns the same
// domain.ErrPasskeyNotFound as any other lookup failure here, rather than
// a distinct "no such user" error that would disclose which usernames
// exist.
func (s *Service) BeginPasskeyLogin(ctx context.Context, in PasskeyLoginInput) (protocol.CredentialAssertion, string, error) {
	w, err := s.webAuthn()
	if err != nil {
		return protocol.CredentialAssertion{}, "", err
	}

	user, found, err := s.repo.GetUserByUsernameOrEmail(ctx, in.TenantID, domain.NormalizeUsername(in.Username))
	if err != nil {
		return protocol.CredentialAssertion{}, "", fmt.Errorf("look up passkey login user: %w", err)
	}
	if !found || !user.CanAuthenticate() {
		return protocol.CredentialAssertion{}, "", domain.ErrPasskeyNotFound
	}

	pkUser, err := s.loadPasskeyUser(ctx, in.TenantID, user.ID, user.Username, user.Name)
	if err != nil {
		return protocol.CredentialAssertion{}, "", err
	}
	if len(pkUser.credentials) == 0 {
		return protocol.CredentialAssertion{}, "", domain.ErrPasskeyNotFound
	}

	assertion, session, err := w.BeginLogin(pkUser)
	if err != nil {
		return protocol.CredentialAssertion{}, "", fmt.Errorf("begin passkey login: %w", err)
	}

	ceremonyID := uuid.NewString()
	if err := s.storeCeremony(ctx, loginCeremonyKey(in.TenantID, ceremonyID), passkeyCeremony{
		TenantID: in.TenantID, UserID: user.ID, Session: *session,
	}); err != nil {
		return protocol.CredentialAssertion{}, "", err
	}

	return *assertion, ceremonyID, nil
}

// FinishPasskeyLoginInput carries the browser's assertion response back to
// the ceremony BeginPasskeyLogin started.
type FinishPasskeyLoginInput struct {
	TenantID    uuid.UUID
	CeremonyID  string
	RawResponse []byte
	Client      domain.ClientKind
	DeviceID    string
	DeviceName  string
	IP          string
	UserAgent   string
}

// FinishPasskeyLogin verifies the assertion and, on success, opens the
// same kind of session Login does.
func (s *Service) FinishPasskeyLogin(ctx context.Context, in FinishPasskeyLoginInput) (AuthResult, error) {
	w, err := s.webAuthn()
	if err != nil {
		return AuthResult{}, err
	}

	ceremony, err := s.takeCeremony(ctx, loginCeremonyKey(in.TenantID, in.CeremonyID))
	if err != nil {
		return AuthResult{}, err
	}

	parsed, err := protocol.ParseCredentialRequestResponseBody(bytes.NewReader(in.RawResponse))
	if err != nil {
		return AuthResult{}, domain.ErrPasskeyInvalidResponse
	}

	var result AuthResult
	err = s.withTx(ctx, in.TenantID, func(ctx context.Context) error {
		user, err := s.repo.GetUserByID(ctx, in.TenantID, ceremony.UserID)
		if err != nil {
			return domain.ErrUserNotFound
		}
		if !user.CanAuthenticate() {
			return domain.ErrAccountNotActive
		}

		pkUser, err := s.loadPasskeyUser(ctx, in.TenantID, user.ID, user.Username, user.Name)
		if err != nil {
			return err
		}

		credential, err := w.ValidateLogin(pkUser, ceremony.Session, parsed)
		if err != nil {
			return domain.ErrPasskeyInvalidResponse
		}

		if err := s.recordPasskeyUsage(ctx, in.TenantID, user.ID, *credential); err != nil {
			return err
		}

		// Same bookkeeping the password path writes on a successful
		// attempt (service/auth.go's login): see sso_google.go's
		// GoogleLogin for why this, rather than a new audit_logs entry,
		// is "the same audit entry the password path writes".
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

// recordPasskeyUsage writes back the authenticator's advanced sign count
// (clone detection) and last-used timestamp for whichever stored
// credential matched the assertion.
func (s *Service) recordPasskeyUsage(ctx context.Context, tenantID, userID uuid.UUID, credential webauthn.Credential) error {
	stored, err := s.repo.ListWebAuthnCredentials(ctx, tenantID, userID)
	if err != nil {
		return fmt.Errorf("list webauthn credentials: %w", err)
	}
	for _, c := range stored {
		if !bytes.Equal(c.Credential.ID, credential.ID) {
			continue
		}
		return s.repo.UpdateWebAuthnCredentialUsage(ctx, tenantID, c.ID, credential)
	}
	return nil
}
