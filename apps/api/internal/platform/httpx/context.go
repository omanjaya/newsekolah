package httpx

import (
	"context"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

type ctxKey int

const (
	tenantIDKey ctxKey = iota
	userIDKey
	sessionIDKey
	refreshCookieKey
	requestMetaKey
	actorIDKey
	apiKeyIDKey
	apiKeyNameKey
)

// RequestMeta carries per-request client metadata that oapi-codegen's
// strict handlers cannot see directly (they receive ctx and a typed
// request object, never the raw *http.Request).
type RequestMeta struct {
	IP        string
	UserAgent string
}

func WithRequestMeta(ctx context.Context, meta RequestMeta) context.Context {
	return context.WithValue(ctx, requestMetaKey, meta)
}

func RequestMetaFromContext(ctx context.Context) RequestMeta {
	meta, _ := ctx.Value(requestMetaKey).(RequestMeta)
	return meta
}

func RequestIDFromContext(ctx context.Context) string {
	return middleware.GetReqID(ctx)
}

func WithTenantID(ctx context.Context, tenantID uuid.UUID) context.Context {
	return context.WithValue(ctx, tenantIDKey, tenantID)
}

func TenantIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(tenantIDKey).(uuid.UUID)
	return id, ok
}

func WithUserID(ctx context.Context, userID uuid.UUID) context.Context {
	return context.WithValue(ctx, userIDKey, userID)
}

func UserIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(userIDKey).(uuid.UUID)
	return id, ok
}

// WithActorID records the real, non-impersonated actor for a request whose
// access token carries an `act` claim (an impersonation session). Absent
// for every ordinary request.
func WithActorID(ctx context.Context, actorID uuid.UUID) context.Context {
	return context.WithValue(ctx, actorIDKey, actorID)
}

func ActorIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(actorIDKey).(uuid.UUID)
	return id, ok
}

func WithSessionID(ctx context.Context, sessionID uuid.UUID) context.Context {
	return context.WithValue(ctx, sessionIDKey, sessionID)
}

func SessionIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(sessionIDKey).(uuid.UUID)
	return id, ok
}

// WithAPIKeyID and WithAPIKeyName record which API key authenticated a
// request, for a session-authenticated request neither is set. Audit
// writes read the name back out so an entry made through a key names it
// instead of only the key's owning user (docs on the integrations module).
func WithAPIKeyID(ctx context.Context, keyID uuid.UUID) context.Context {
	return context.WithValue(ctx, apiKeyIDKey, keyID)
}

func APIKeyIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(apiKeyIDKey).(uuid.UUID)
	return id, ok
}

func WithAPIKeyName(ctx context.Context, name string) context.Context {
	return context.WithValue(ctx, apiKeyNameKey, name)
}

func APIKeyNameFromContext(ctx context.Context) (string, bool) {
	name, ok := ctx.Value(apiKeyNameKey).(string)
	return name, ok && name != ""
}

func WithRefreshCookie(ctx context.Context, value string) context.Context {
	return context.WithValue(ctx, refreshCookieKey, value)
}

// RefreshCookieFromContext returns the `refresh_token` cookie value set by
// the RefreshCookieMiddleware, if the request carried one.
func RefreshCookieFromContext(ctx context.Context) (string, bool) {
	v, ok := ctx.Value(refreshCookieKey).(string)
	return v, ok && v != ""
}
