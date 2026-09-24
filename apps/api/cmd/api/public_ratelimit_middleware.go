package main

import (
	"context"
	"net/http"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// publicIPRateLimit is one operation's per-IP budget.
type publicIPRateLimit struct {
	limit  int64
	window time.Duration
}

// publicIPRateLimits bounds every operation an anonymous client can reach
// without a session (x-public: true in openapi.yaml) that is not already
// covered by its own account+IP limiter. Login (auth.LoginRateLimiter) and
// password-reset-request (identity's ResetLimiter, wired in wire.go) stay
// out of this map on purpose so they keep their existing, tighter,
// account-aware budgets instead of being double-limited here.
//
// Budgets are generous relative to a single legitimate user (a person does
// not search the library catalogue or check a document's authenticity
// dozens of times a minute) but well below what would let one IP scrape a
// tenant's public data set or hammer a webhook, per docs/08-security.md
// section 7's rate-limit requirement for public endpoints.
var publicIPRateLimits = map[string]publicIPRateLimit{
	// Document verification returns a student's name and class to anyone
	// holding the code on the document; a tight budget bounds guessing
	// codes for other people's documents.
	"VerifyDocument": {limit: 30, window: time.Minute},

	// OPAC (library catalogue) is read-only public data, but still worth
	// bounding against scraping the whole catalogue from one IP.
	"SearchOpacTitles":   {limit: 120, window: time.Minute},
	"GetOpacTitleDetail": {limit: 120, window: time.Minute},
	"GetOpacHighlights":  {limit: 120, window: time.Minute},

	// Branding and tenant lookup are hit once per app/browser load; a
	// generous budget still stops one IP from hammering them.
	"GetTenantBranding": {limit: 60, window: time.Minute},
	"LookupTenants":     {limit: 60, window: time.Minute},

	// The verify (GET, Meta's handshake) and receive (POST, message/status
	// deliveries) webhook operations are separately authenticated by
	// WHATSAPP_APP_SECRET/verify-token checks in the handler; this is a
	// second, IP-based backstop against one source flooding the endpoint.
	"VerifyWhatsAppWebhook":  {limit: 60, window: time.Minute},
	"ReceiveWhatsAppWebhook": {limit: 120, window: time.Minute},

	// SSO/passkey pre-auth steps: availability check, the OIDC start/
	// callback route, and the passkey "get login options" step (not the
	// credential-submitting finish step, which requires a real
	// credential and is already bounded by that).
	"GetGoogleSSOAvailability": {limit: 60, window: time.Minute},
	"LoginWithGoogle":          {limit: 30, window: time.Minute},
	"BeginPasskeyLogin":        {limit: 30, window: time.Minute},

	// Library kiosk mint/scan both require x-permission "authenticated"
	// (any logged-in account, no specific permission) rather than being
	// fully anonymous, but the scan endpoint consumes a short-lived
	// opaque token supplied by the caller -- exactly the kind of
	// guessable-secret surface a per-IP budget should bound regardless of
	// the caller having *some* account.
	"IssueLibraryKioskToken": {limit: 60, window: time.Minute},
	"ScanLibraryKioskVisit":  {limit: 60, window: time.Minute},
}

// publicIPRateLimitStrictMiddleware enforces publicIPRateLimits by
// operationId, keying each counter on the real client IP that RealIP
// already resolved (docs/08-security.md TRUSTED_PROXIES). Redis-backed via
// store in production; store degrades to auth.MemoryStore without
// REDIS_URL, so this still works (single-process only) in dev.
func publicIPRateLimitStrictMiddleware(store auth.KVStore) api.StrictMiddlewareFunc {
	limiters := make(map[string]*auth.IPRateLimiter, len(publicIPRateLimits))
	for operationID, budget := range publicIPRateLimits {
		limiters[operationID] = auth.NewIPRateLimiter(store, "ratelimit:"+operationID, budget.limit, budget.window)
	}

	return func(next api.StrictHandlerFunc, operationID string) api.StrictHandlerFunc {
		limiter, ok := limiters[operationID]
		if !ok {
			return next
		}
		return func(ctx context.Context, w http.ResponseWriter, r *http.Request, request any) (any, error) {
			ip := httpx.RequestMetaFromContext(ctx).IP
			allowed, err := limiter.Allow(ctx, ip)
			if err != nil {
				return nil, httpx.Internal(err)
			}
			if !allowed {
				return nil, httpx.ErrRateLimited
			}
			return next(ctx, w, r, request)
		}
	}
}
