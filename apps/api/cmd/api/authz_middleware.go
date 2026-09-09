package main

import (
	"context"
	"net/http"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// authzStrictMiddleware adapts authz.Authorize to oapi-codegen's
// StrictMiddlewareFunc, which is what actually gates every operation: it
// runs after routing has resolved an operationId, so (unlike a plain chi
// middleware) it can look up that operation's x-permission declaration.
//
// The operationId oapi-codegen passes here is the same string it parses
// out of the embedded spec's `operationId` field verbatim (e.g.
// "GetHealth" for `operationId: getHealth` in openapi.yaml -- it
// capitalizes the copy it keeps for Go identifier generation, and that is
// also what ends up in the embedded spec doc, so authz.LoadOperationPermissions
// sees the exact same string as this middleware does).
func authzStrictMiddleware(ops authz.OperationPermissions, provider authz.PermissionsProvider) api.StrictMiddlewareFunc {
	return func(f api.StrictHandlerFunc, operationID string) api.StrictHandlerFunc {
		return func(ctx context.Context, w http.ResponseWriter, r *http.Request, request any) (any, error) {
			identity := authz.IdentityFromContext(ctx)
			if err := authz.Authorize(ctx, ops, provider, operationID, identity); err != nil {
				return nil, err
			}
			return f(ctx, w, r, request)
		}
	}
}
