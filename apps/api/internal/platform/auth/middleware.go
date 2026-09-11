package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// SessionLookup is implemented by the identity module's repository/service
// so platform/auth (which modules depend on) never imports a module back.
type SessionLookup interface {
	IsSessionActive(ctx context.Context, tenantID, sessionID uuid.UUID) (bool, error)
	TouchSessionLastSeen(ctx context.Context, tenantID, sessionID uuid.UUID) error
}

type Authenticator struct {
	issuer   *TokenIssuer
	cache    *SessionCache
	sessions SessionLookup
	apiKeys  APIKeyLookup
	apiRate  *APIKeyRateLimiter
}

func NewAuthenticator(issuer *TokenIssuer, cache *SessionCache, sessions SessionLookup) *Authenticator {
	return &Authenticator{issuer: issuer, cache: cache, sessions: sessions}
}

// WithAPIKeys enables the "nsk_..." bearer token path. Called once at
// wiring time after the integrations module (which implements APIKeyLookup)
// is constructed; without it, a request presenting an API key token is
// treated as an unrecognized token, same as before this module existed.
func (a *Authenticator) WithAPIKeys(lookup APIKeyLookup, store KVStore) *Authenticator {
	a.apiKeys = lookup
	a.apiRate = NewAPIKeyRateLimiter(store)
	return a
}

// Middleware is intentionally "soft": it never itself rejects a request. It
// attaches an authz.Identity describing what it found (authenticated,
// explicitly invalid, or absent) and lets the authz layer -- which knows
// whether the target operation even requires auth -- make the allow/deny
// call. This is what lets public and protected operations share one
// pipeline without a route-by-route branch here.
func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := bearerToken(r)
		if !ok {
			next.ServeHTTP(w, r.WithContext(authz.WithIdentity(r.Context(), authz.Identity{})))
			return
		}

		var (
			id  authz.Identity
			ctx context.Context
		)
		if a.apiKeys != nil && strings.HasPrefix(token, APIKeyTokenPrefix) {
			id, ctx = a.authenticateAPIKey(r, token)
		} else {
			id, ctx = a.authenticate(r, token)
		}
		next.ServeHTTP(w, r.WithContext(authz.WithIdentity(ctx, id)))
	})
}

// authenticateAPIKey verifies a "nsk_..." token through the injected
// APIKeyLookup and applies the key's own per-minute rate limit, on top of
// (not instead of) whatever limits apply to the resolved user's session
// requests.
func (a *Authenticator) authenticateAPIKey(r *http.Request, token string) (authz.Identity, context.Context) {
	ctx := r.Context()

	tenantID := uuid.Nil
	if resolved, ok := tenant.FromContext(ctx); ok {
		tenantID = resolved.ID
	}

	keyID, secret, ok := ParseAPIKeyToken(token)
	if !ok {
		return authz.Identity{Err: httpx.ErrAPIKeyInvalid}, ctx
	}

	principal, err := a.apiKeys.Authenticate(ctx, tenantID, APIKeyTokenPrefix+keyID.String()+"."+secret, clientIP(r))
	if err != nil {
		return authz.Identity{Err: mapAPIKeyError(err)}, ctx
	}

	if a.apiRate != nil {
		allowed, rateErr := a.apiRate.Allow(ctx, principal.KeyID, principal.RateLimitPerMinute)
		if rateErr != nil {
			return authz.Identity{Err: httpx.ErrInternal}, ctx
		}
		if !allowed {
			return authz.Identity{Err: httpx.ErrAPIKeyRateLimited}, ctx
		}
	}

	ctx = httpx.WithUserID(ctx, principal.OwnerUserID)
	ctx = httpx.WithTenantID(ctx, tenantID)
	ctx = httpx.WithAPIKeyID(ctx, principal.KeyID)
	ctx = httpx.WithAPIKeyName(ctx, principal.KeyName)

	permissions := principal.Permissions
	return authz.Identity{
		Authenticated:  true,
		UserID:         principal.OwnerUserID,
		TenantID:       tenantID,
		KeyPermissions: &permissions,
	}, ctx
}

func mapAPIKeyError(err error) *httpx.Error {
	switch {
	case errors.Is(err, ErrAPIKeyExpired):
		return httpx.ErrAPIKeyExpired
	case errors.Is(err, ErrAPIKeyRevoked):
		return httpx.ErrAPIKeyRevokedAuth
	case errors.Is(err, ErrAPIKeyIPNotAllowed):
		return httpx.ErrAPIKeyIPNotAllowed
	case errors.Is(err, ErrAPIKeyRateLimited):
		return httpx.ErrAPIKeyRateLimited
	case errors.Is(err, ErrAPIKeyNotFound):
		return httpx.ErrAPIKeyInvalid
	default:
		return httpx.ErrAPIKeyInvalid
	}
}

// clientIP reads the address RealIP middleware already resolved (trusted
// proxy chain applied), so the ip allow list check sees the same address
// every other part of the request pipeline does.
func clientIP(r *http.Request) string {
	return httpx.RequestMetaFromContext(r.Context()).IP
}

func (a *Authenticator) authenticate(r *http.Request, token string) (authz.Identity, context.Context) {
	ctx := r.Context()

	claims, err := a.issuer.VerifyAccessToken(token)
	if err != nil {
		return authz.Identity{Err: httpx.ErrTokenExpired}, ctx
	}

	userID, err1 := uuid.Parse(claims.Subject)
	tenantID, err2 := uuid.Parse(claims.TenantID)
	sessionID, err3 := uuid.Parse(claims.SessionID)
	if err1 != nil || err2 != nil || err3 != nil {
		return authz.Identity{Err: httpx.ErrTokenInvalid}, ctx
	}

	if resolved, ok := tenant.FromContext(ctx); ok && resolved.ID != tenantID {
		return authz.Identity{Err: httpx.ErrTokenInvalid}, ctx
	}

	active, found, err := a.cache.Get(ctx, sessionID)
	if err != nil {
		return authz.Identity{Err: httpx.ErrInternal}, ctx
	}
	if !found {
		active, err = a.sessions.IsSessionActive(ctx, tenantID, sessionID)
		if err != nil {
			return authz.Identity{Err: httpx.ErrInternal}, ctx
		}
		_ = a.cache.SetActive(ctx, sessionID, active)
	}
	if !active {
		return authz.Identity{Err: httpx.ErrSessionRevoked}, ctx
	}

	if a.cache.ShouldTouchLastSeen(ctx, sessionID) {
		_ = a.sessions.TouchSessionLastSeen(ctx, tenantID, sessionID)
	}

	ctx = httpx.WithUserID(ctx, userID)
	ctx = httpx.WithTenantID(ctx, tenantID)
	ctx = httpx.WithSessionID(ctx, sessionID)

	identity := authz.Identity{
		Authenticated: true,
		UserID:        userID,
		TenantID:      tenantID,
		SessionID:     sessionID,
		Roles:         claims.Roles,
	}

	if claims.ActorID != "" {
		actorID, err := uuid.Parse(claims.ActorID)
		if err != nil {
			return authz.Identity{Err: httpx.ErrTokenInvalid}, ctx
		}
		identity.ActorUserID = uuid.NullUUID{UUID: actorID, Valid: true}
		ctx = httpx.WithActorID(ctx, actorID)
	}

	return identity, ctx
}

func bearerToken(r *http.Request) (string, bool) {
	header := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return "", false
	}
	return strings.TrimPrefix(header, prefix), true
}
