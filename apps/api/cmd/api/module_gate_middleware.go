package main

import (
	"context"
	"net/http"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/modulegate"
	"github.com/omanjaya/newsekolah/apps/api/internal/wiring"
)

// moduleFlagCacheTTL is how long the module gate trusts a tenant's cached
// feature flags; a package variable only so integration tests can set it to
// zero and toggle flags with plain SQL.
var moduleFlagCacheTTL = wiring.DefaultFlagCacheTTL

// moduleGateStrictMiddleware refuses every operation of a feature-flagged
// module while that module is disabled for the tenant. It sits inside authz
// (an unauthenticated or unauthorized caller gets 401/403 from authz first)
// and outside idempotency (a refused request never claims an
// Idempotency-Key).
func moduleGateStrictMiddleware(ops modulegate.OperationModules, flags modulegate.FlagReader) api.StrictMiddlewareFunc {
	return func(f api.StrictHandlerFunc, operationID string) api.StrictHandlerFunc {
		return func(ctx context.Context, w http.ResponseWriter, r *http.Request, request any) (any, error) {
			if err := modulegate.Check(ctx, ops, flags, operationID); err != nil {
				return nil, err
			}
			return f(ctx, w, r, request)
		}
	}
}
