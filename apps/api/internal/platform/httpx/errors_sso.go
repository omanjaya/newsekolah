package httpx

import "net/http"

var (
	// ErrSSONotConfigured means the tenant has not set up (or has
	// disabled) Google Workspace SSO.
	ErrSSONotConfigured = NewError(http.StatusConflict, "SSO_NOT_CONFIGURED")
	// ErrSSOAccountNotFound means the Google ID token verified but its
	// email does not match an existing active account -- identity never
	// creates one implicitly.
	ErrSSOAccountNotFound = NewError(http.StatusForbidden, "SSO_ACCOUNT_NOT_FOUND")
	// ErrSSOInvalidToken covers a Google ID token that failed signature,
	// issuer, audience, expiry, or hosted-domain verification.
	ErrSSOInvalidToken = NewError(http.StatusUnauthorized, "SSO_INVALID_TOKEN")
	// ErrSSOClientSecretRequired is returned when an admin tries to
	// create a Google SSO configuration without supplying a client
	// secret.
	ErrSSOClientSecretRequired = NewError(http.StatusBadRequest, "SSO_CLIENT_SECRET_REQUIRED")

	// ErrPasskeyNotConfigured means this server has no Relying Party ID
	// configured, so passkeys are unavailable.
	ErrPasskeyNotConfigured = NewError(http.StatusConflict, "PASSKEY_NOT_CONFIGURED")
	// ErrPasskeyNotFound covers a passkey id that does not exist or does
	// not belong to the caller, and a login attempt for an account with
	// no registered passkey.
	ErrPasskeyNotFound = NewError(http.StatusNotFound, "PASSKEY_NOT_FOUND")
	// ErrPasskeyChallenge means the registration or login ceremony has
	// expired, was already used, or was never started.
	ErrPasskeyChallenge = NewError(http.StatusBadRequest, "PASSKEY_CHALLENGE_EXPIRED")
	// ErrPasskeyInvalidResponse means the browser's WebAuthn response
	// failed verification (wrong origin, bad signature, replayed
	// counter, malformed payload).
	ErrPasskeyInvalidResponse = NewError(http.StatusBadRequest, "PASSKEY_INVALID_RESPONSE")
)
