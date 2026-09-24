package main

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestPasswordResetRequestIsRateLimitedPerIP proves buildRouter actually
// wires identity.Dependencies.ResetLimiter (cmd/api/wire.go), not just that
// the service-level check works in isolation. Before this fix,
// ResetLimiter was never passed and RequestPasswordReset's nil check
// silently skipped rate limiting in production -- this test would have
// hung waiting for a 429 that never came.
func TestPasswordResetRequestIsRateLimitedPerIP(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	seedTenantWithUser(t, ctx, pg.AdminPool, "reset-ratelimit-wire-test", "resetflowuser", "Password123!", nil)
	server := newTestServer(t, pg.DSN, pg.AppPool)

	body := map[string]any{"username_or_email": "resetflowuser"}

	// wire.go's resetLimiter budget is 20 requests per 15 minutes per IP;
	// every httptest.NewRequest in this process shares the same RemoteAddr
	// (RealIP is a no-op with no configured trusted proxies), so all of
	// these calls count against one IP bucket.
	const budget = 20
	for i := 0; i < budget; i++ {
		rec := doJSON(t, server, http.MethodPost, "/v1/auth/password-reset/request", body, nil)
		require.Equal(t, http.StatusAccepted, rec.Code, "request %d within budget must succeed: %s", i+1, rec.Body.String())
	}

	rec := doJSON(t, server, http.MethodPost, "/v1/auth/password-reset/request", body, nil)
	require.Equal(t, http.StatusTooManyRequests, rec.Code, "request past the per-IP budget must be rejected: %s", rec.Body.String())
	require.Contains(t, rec.Body.String(), "RATE_LIMITED")
}

// TestPublicEndpointIsRateLimitedPerIP proves the publicIPRateLimit strict
// middleware (cmd/api/public_ratelimit_middleware.go) is actually wired
// into buildRouter's strict handler chain end to end, using the public
// branding endpoint as one representative x-public: true operation.
func TestPublicEndpointIsRateLimitedPerIP(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	seedTenantWithUser(t, ctx, pg.AdminPool, "branding-ratelimit-test", "brandinguser", "Password123!", nil)
	server := newTestServer(t, pg.DSN, pg.AppPool)

	budget := publicIPRateLimits["GetTenantBranding"].limit
	for i := int64(0); i < budget; i++ {
		rec := doJSON(t, server, http.MethodGet, "/v1/tenant/branding", nil, nil)
		require.Equal(t, http.StatusOK, rec.Code, "request %d within budget must succeed: %s", i+1, rec.Body.String())
	}

	rec := doJSON(t, server, http.MethodGet, "/v1/tenant/branding", nil, nil)
	require.Equal(t, http.StatusTooManyRequests, rec.Code, "request past the per-IP budget must be rejected: %s", rec.Body.String())
	require.Contains(t, rec.Body.String(), "RATE_LIMITED")
}
