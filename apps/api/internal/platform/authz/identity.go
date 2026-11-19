package authz

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// Identity is the outcome of the (soft) authentication middleware: either a
// verified principal, an explicit auth error (a token was presented but is
// invalid/expired/revoked), or neither (no token at all, e.g. a public
// endpoint). Authorize is what turns this into a decision.
type Identity struct {
	Authenticated bool
	UserID        uuid.UUID
	TenantID      uuid.UUID
	SessionID     uuid.UUID
	Roles         []string
	Err           error

	// ActorUserID is set only during an impersonation session: the real
	// admin identified by the access token's `act` claim, as opposed to
	// UserID, which is the impersonated user the session belongs to.
	ActorUserID uuid.NullUUID

	// KeyPermissions is set only when the request authenticated with an API
	// key (platform/auth's key-based path) rather than a session. It caps
	// the effective permission set at whatever explicit subset the key was
	// created with, on top of (never instead of) the owning user's own
	// permissions -- a key can never grant more than its creator has.
	KeyPermissions *Set
}

type identityCtxKey struct{}

func WithIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, identityCtxKey{}, id)
}

func IdentityFromContext(ctx context.Context) Identity {
	id, _ := ctx.Value(identityCtxKey{}).(Identity)
	return id
}

// PermissionsProvider computes a user's effective permission set (role
// permissions union active duty permissions). Implemented by the identity
// module's service and injected at wiring time.
type PermissionsProvider interface {
	EffectivePermissions(ctx context.Context, tenantID, userID uuid.UUID) (Set, error)
}

// Authorize is the single place that turns an OpenAPI operation's
// x-permission declaration plus the current Identity into allow/deny. It is
// deliberately framework-agnostic (no chi, no gen/api) so it is unit
// testable without an HTTP server.
func Authorize(ctx context.Context, ops OperationPermissions, provider PermissionsProvider, operationID string, id Identity) error {
	if ops.IsPublic(operationID) {
		return nil
	}

	required, ok := ops.Permissions(operationID)
	if !ok {
		return httpx.WrapError(500, "AUTHZ_NOT_CONFIGURED", errUnconfigured(operationID))
	}

	if id.Err != nil {
		return id.Err
	}
	if !id.Authenticated {
		return httpx.ErrTokenInvalid
	}
	if len(required) == 1 && required[0] == permAuthenticated {
		return nil
	}

	perms, err := provider.EffectivePermissions(ctx, id.TenantID, id.UserID)
	if err != nil {
		return err
	}
	// Any one alternative is enough, but it must be one the user holds and,
	// for an API key, one the key was granted as well: a key never borrows
	// an alternative its owner holds but the key itself does not.
	for _, perm := range required {
		if perms.Has(perm) && (id.KeyPermissions == nil || id.KeyPermissions.Has(perm)) {
			return nil
		}
	}
	return httpx.ErrForbidden
}

type unconfiguredError string

func (e unconfiguredError) Error() string {
	return "operation " + string(e) + " has no permission configured"
}

func errUnconfigured(operationID string) error { return unconfiguredError(operationID) }
