package auth

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// APIKeyTokenPrefix marks a bearer token as an API key rather than a JWT
// access token, so Authenticator.Middleware can route to the right
// verification path without trying (and failing) JWT parsing first.
const APIKeyTokenPrefix = "nsk_"

// Sentinel errors an APIKeyLookup implementation returns for each way a key
// can fail to authenticate a request; Authenticator.Middleware maps each to
// its httpx.Error so the response carries a stable, documented code.
var (
	ErrAPIKeyNotFound     = errors.New("auth: api key not found")
	ErrAPIKeyExpired      = errors.New("auth: api key expired")
	ErrAPIKeyRevoked      = errors.New("auth: api key revoked")
	ErrAPIKeyIPNotAllowed = errors.New("auth: api key ip not allowed")
	ErrAPIKeyRateLimited  = errors.New("auth: api key rate limited")
)

// APIKeyPrincipal is what a valid key resolves to: the same tenant scoping
// and authorization identity a session would get (docs/12-roadmap.md,
// "a request authenticating with a key gets the same tenant scoping and
// the same authz checks as a session"), plus the key's own identity so
// callers can rate-limit and audit against it.
type APIKeyPrincipal struct {
	KeyID              uuid.UUID
	KeyName            string
	OwnerUserID        uuid.UUID
	Permissions        authz.Set
	RateLimitPerMinute int64
}

// APIKeyLookup is implemented by the integrations module (which owns the
// api key table) and injected here, the same split as SessionLookup above:
// platform/auth is a dependency of every module, so it can never import one
// back.
type APIKeyLookup interface {
	// Authenticate verifies rawKey for tenantID and, if valid, active,
	// unexpired, and ip is within the key's allow list (or the list is
	// empty), returns the principal it resolves to. It also records
	// last-used-at; callers do not need a separate touch call.
	Authenticate(ctx context.Context, tenantID uuid.UUID, rawKey, ip string) (APIKeyPrincipal, error)
}

// ParseAPIKeyToken splits a "nsk_<key id>.<secret>" bearer token into its
// parts. The key id is embedded so lookup is a single indexed read instead
// of a hash comparison against every key in the tenant.
func ParseAPIKeyToken(token string) (keyID uuid.UUID, secret string, ok bool) {
	if !strings.HasPrefix(token, APIKeyTokenPrefix) {
		return uuid.Nil, "", false
	}
	rest := strings.TrimPrefix(token, APIKeyTokenPrefix)
	idPart, secretPart, found := strings.Cut(rest, ".")
	if !found || secretPart == "" {
		return uuid.Nil, "", false
	}
	id, err := uuid.Parse(idPart)
	if err != nil {
		return uuid.Nil, "", false
	}
	return id, secretPart, true
}

// NewAPIKeyToken formats the token handed to the caller once, at creation
// time: it is never reconstructable from what is stored (only the secret's
// hash is kept).
func NewAPIKeyToken(keyID uuid.UUID, secret string) string {
	return APIKeyTokenPrefix + keyID.String() + "." + secret
}
