package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// passkeyCeremonyTTL bounds how long a registration or login ceremony's
// challenge stays valid; it matches the WebAuthn library's own default
// operation timeout, so a ceremony never outlives what the browser itself
// would already have abandoned.
const passkeyCeremonyTTL = 5 * time.Minute

// WebAuthnCredential is one passkey a user has registered, as shown on the
// security screen.
type WebAuthnCredential struct {
	ID         uuid.UUID
	UserID     uuid.UUID
	Name       string
	CreatedAt  time.Time
	LastUsedAt *time.Time
	Credential webauthn.Credential
}

// PasskeyRepository is the WebAuthn credential slice of the identity
// repository.
type PasskeyRepository interface {
	ListWebAuthnCredentials(ctx context.Context, tenantID, userID uuid.UUID) ([]WebAuthnCredential, error)
	GetWebAuthnCredential(ctx context.Context, tenantID, id uuid.UUID) (WebAuthnCredential, error)
	InsertWebAuthnCredential(ctx context.Context, tenantID, userID uuid.UUID, name string, cred webauthn.Credential) (WebAuthnCredential, error)
	UpdateWebAuthnCredentialUsage(ctx context.Context, tenantID, id uuid.UUID, cred webauthn.Credential) error
	RenameWebAuthnCredential(ctx context.Context, tenantID, id uuid.UUID, name string) (WebAuthnCredential, error)
	DeleteWebAuthnCredential(ctx context.Context, tenantID, id uuid.UUID) error
}

// passkeyUser adapts a loaded set of credentials to webauthn.User. The
// user handle is the account's own uuid, per the library's recommendation
// that it be stable and never re-used.
type passkeyUser struct {
	id          uuid.UUID
	username    string
	displayName string
	credentials []webauthn.Credential
}

func (u passkeyUser) WebAuthnID() []byte                         { return u.id[:] }
func (u passkeyUser) WebAuthnName() string                       { return u.username }
func (u passkeyUser) WebAuthnDisplayName() string                { return u.displayName }
func (u passkeyUser) WebAuthnCredentials() []webauthn.Credential { return u.credentials }

// passkeyCeremony is what a Begin call persists in the ceremony store so
// the matching Finish call, on a later request, can pick it back up.
type passkeyCeremony struct {
	TenantID uuid.UUID            `json:"tenant_id"`
	UserID   uuid.UUID            `json:"user_id"`
	Session  webauthn.SessionData `json:"session"`
}

func (s *Service) webAuthn() (*webauthn.WebAuthn, error) {
	if s.ceremony == nil || s.cfg.PasskeyRPID == "" || len(s.cfg.PasskeyRPOrigins) == 0 {
		return nil, domain.ErrPasskeyNotConfigured
	}
	displayName := s.cfg.PasskeyRPDisplayName
	if displayName == "" {
		displayName = "newsekolah"
	}
	return webauthn.New(&webauthn.Config{
		RPID:          s.cfg.PasskeyRPID,
		RPDisplayName: displayName,
		RPOrigins:     s.cfg.PasskeyRPOrigins,
	})
}

func (s *Service) loadPasskeyUser(ctx context.Context, tenantID, userID uuid.UUID, username, displayName string) (passkeyUser, error) {
	stored, err := s.repo.ListWebAuthnCredentials(ctx, tenantID, userID)
	if err != nil {
		return passkeyUser{}, fmt.Errorf("list webauthn credentials: %w", err)
	}
	creds := make([]webauthn.Credential, len(stored))
	for i, c := range stored {
		creds[i] = c.Credential
	}
	return passkeyUser{id: userID, username: username, displayName: displayName, credentials: creds}, nil
}

// BeginPasskeyRegistration starts a registration ceremony for the caller's
// own account (they must already have a session). It returns the
// browser-facing creation options and an opaque ceremony id the client
// echoes back to FinishPasskeyRegistration.
func (s *Service) BeginPasskeyRegistration(ctx context.Context, tenantID, userID uuid.UUID, username, displayName string) (protocol.CredentialCreation, string, error) {
	w, err := s.webAuthn()
	if err != nil {
		return protocol.CredentialCreation{}, "", err
	}

	var user passkeyUser
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		user, err = s.loadPasskeyUser(ctx, tenantID, userID, username, displayName)
		return err
	})
	if err != nil {
		return protocol.CredentialCreation{}, "", err
	}

	creation, session, err := w.BeginRegistration(user)
	if err != nil {
		return protocol.CredentialCreation{}, "", fmt.Errorf("begin passkey registration: %w", err)
	}

	ceremonyID := uuid.NewString()
	if err := s.storeCeremony(ctx, registrationCeremonyKey(tenantID, ceremonyID), passkeyCeremony{
		TenantID: tenantID, UserID: userID, Session: *session,
	}); err != nil {
		return protocol.CredentialCreation{}, "", err
	}

	return *creation, ceremonyID, nil
}

// FinishPasskeyRegistration verifies the browser's attestation response
// and stores the new credential. rawResponse is the JSON body the browser
// produced from PublicKeyCredential.toJSON() after navigator.credentials.create().
func (s *Service) FinishPasskeyRegistration(ctx context.Context, tenantID, userID uuid.UUID, ceremonyID string, rawResponse []byte, name string) (WebAuthnCredential, error) {
	w, err := s.webAuthn()
	if err != nil {
		return WebAuthnCredential{}, err
	}

	ceremony, err := s.takeCeremony(ctx, registrationCeremonyKey(tenantID, ceremonyID))
	if err != nil {
		return WebAuthnCredential{}, err
	}
	if ceremony.UserID != userID {
		return WebAuthnCredential{}, domain.ErrPasskeyChallenge
	}

	parsed, err := protocol.ParseCredentialCreationResponseBody(bytes.NewReader(rawResponse))
	if err != nil {
		return WebAuthnCredential{}, domain.ErrPasskeyInvalidResponse
	}

	user, err := s.loadPasskeyUser(ctx, tenantID, userID, "", "")
	if err != nil {
		return WebAuthnCredential{}, err
	}

	credential, err := w.CreateCredential(user, ceremony.Session, parsed)
	if err != nil {
		return WebAuthnCredential{}, domain.ErrPasskeyInvalidResponse
	}

	var result WebAuthnCredential
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		stored, err := s.repo.InsertWebAuthnCredential(ctx, tenantID, userID, name, *credential)
		if err != nil {
			return fmt.Errorf("insert webauthn credential: %w", err)
		}
		result = stored
		return audit.RecordSimple(ctx, tenantID, "passkey.register", "webauthn_credential", stored.ID)
	})
	return result, err
}

// ListPasskeys returns the caller's own registered passkeys.
func (s *Service) ListPasskeys(ctx context.Context, tenantID, userID uuid.UUID) ([]WebAuthnCredential, error) {
	var creds []WebAuthnCredential
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		creds, err = s.repo.ListWebAuthnCredentials(ctx, tenantID, userID)
		return err
	})
	return creds, err
}

// RenamePasskey renames one of the caller's own passkeys.
func (s *Service) RenamePasskey(ctx context.Context, tenantID, userID, credentialID uuid.UUID, name string) (WebAuthnCredential, error) {
	var result WebAuthnCredential
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		owned, err := s.ownsPasskey(ctx, tenantID, userID, credentialID)
		if err != nil {
			return err
		}
		if !owned {
			return domain.ErrPasskeyNotFound
		}
		result, err = s.repo.RenameWebAuthnCredential(ctx, tenantID, credentialID, name)
		return err
	})
	return result, err
}

// DeletePasskey removes one of the caller's own passkeys; it never allows
// removing another user's, the same object-level check RevokeSession uses
// for sessions (docs/08-security.md section 3).
func (s *Service) DeletePasskey(ctx context.Context, tenantID, userID, credentialID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		owned, err := s.ownsPasskey(ctx, tenantID, userID, credentialID)
		if err != nil {
			return err
		}
		if !owned {
			return domain.ErrPasskeyNotFound
		}
		if err := s.repo.DeleteWebAuthnCredential(ctx, tenantID, credentialID); err != nil {
			return err
		}
		return audit.RecordSimple(ctx, tenantID, "passkey.remove", "webauthn_credential", credentialID)
	})
}

func (s *Service) ownsPasskey(ctx context.Context, tenantID, userID, credentialID uuid.UUID) (bool, error) {
	cred, err := s.repo.GetWebAuthnCredential(ctx, tenantID, credentialID)
	if err != nil {
		return false, nil //nolint:nilerr // a lookup miss and an ownership mismatch are the same "not found" to the caller
	}
	return cred.UserID == userID, nil
}

func (s *Service) storeCeremony(ctx context.Context, key string, c passkeyCeremony) error {
	payload, err := json.Marshal(c)
	if err != nil {
		return fmt.Errorf("marshal passkey ceremony: %w", err)
	}
	if err := s.ceremony.Set(ctx, key, string(payload), passkeyCeremonyTTL); err != nil {
		return fmt.Errorf("store passkey ceremony: %w", err)
	}
	return nil
}

// takeCeremony reads and deletes the ceremony at key: it is one-time use,
// so a captured Finish request cannot be replayed.
func (s *Service) takeCeremony(ctx context.Context, key string) (passkeyCeremony, error) {
	raw, ok, err := s.ceremony.Get(ctx, key)
	if err != nil {
		return passkeyCeremony{}, fmt.Errorf("load passkey ceremony: %w", err)
	}
	if !ok {
		return passkeyCeremony{}, domain.ErrPasskeyChallenge
	}
	_ = s.ceremony.Del(ctx, key)

	var c passkeyCeremony
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return passkeyCeremony{}, fmt.Errorf("unmarshal passkey ceremony: %w", err)
	}
	return c, nil
}

func registrationCeremonyKey(tenantID uuid.UUID, ceremonyID string) string {
	return fmt.Sprintf("webauthn:reg:%s:%s", tenantID, ceremonyID)
}

func loginCeremonyKey(tenantID uuid.UUID, ceremonyID string) string {
	return fmt.Sprintf("webauthn:login:%s:%s", tenantID, ceremonyID)
}
