package auth

import (
	"context"
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
}

type Authenticator struct {
	issuer   *TokenIssuer
	cache    *SessionCache
	sessions SessionLookup
}

func NewAuthenticator(issuer *TokenIssuer, cache *SessionCache, sessions SessionLookup) *Authenticator {
	return &Authenticator{issuer: issuer, cache: cache, sessions: sessions}
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

		id, ctx := a.authenticate(r, token)
		next.ServeHTTP(w, r.WithContext(authz.WithIdentity(ctx, id)))
	})
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
