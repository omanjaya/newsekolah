package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

func TestPublicIPRateLimitStrictMiddleware_BlocksOverBudgetIP(t *testing.T) {
	store := auth.NewMemoryStore()
	mw := publicIPRateLimitStrictMiddleware(store)

	calls := 0
	next := func(ctx context.Context, w http.ResponseWriter, r *http.Request, request any) (any, error) {
		calls++
		return "ok", nil
	}
	handler := mw(next, "VerifyDocument")

	budget := publicIPRateLimits["VerifyDocument"]
	ctx := httpx.WithRequestMeta(context.Background(), httpx.RequestMeta{IP: "203.0.113.7"})
	req := httptest.NewRequest(http.MethodGet, "/v1/documents/verify/ABC123", nil)
	rec := httptest.NewRecorder()

	for i := int64(0); i < budget.limit; i++ {
		resp, err := handler(ctx, rec, req, nil)
		require.NoError(t, err)
		require.Equal(t, "ok", resp)
	}
	require.Equal(t, int(budget.limit), calls, "every within-budget call should reach the handler")

	// One more over the budget: rejected, and the wrapped handler is never
	// called (the counter must not advance further as a side effect).
	resp, err := handler(ctx, rec, req, nil)
	require.Nil(t, resp)
	require.Error(t, err)

	var appErr *httpx.Error
	require.True(t, errors.As(err, &appErr), "error must be a *httpx.Error")
	require.Equal(t, httpx.ErrRateLimited.Code, appErr.Code)
	require.Equal(t, http.StatusTooManyRequests, appErr.Status)
	require.Equal(t, int(budget.limit), calls, "an over-budget call must not reach the handler")
}

func TestPublicIPRateLimitStrictMiddleware_TracksEachIPIndependently(t *testing.T) {
	store := auth.NewMemoryStore()
	mw := publicIPRateLimitStrictMiddleware(store)

	next := func(ctx context.Context, w http.ResponseWriter, r *http.Request, request any) (any, error) {
		return "ok", nil
	}
	handler := mw(next, "GetTenantBranding")
	budget := publicIPRateLimits["GetTenantBranding"]
	req := httptest.NewRequest(http.MethodGet, "/v1/tenant/branding", nil)
	rec := httptest.NewRecorder()

	exhaust := func(ip string) {
		ctx := httpx.WithRequestMeta(context.Background(), httpx.RequestMeta{IP: ip})
		for i := int64(0); i < budget.limit; i++ {
			_, err := handler(ctx, rec, req, nil)
			require.NoError(t, err)
		}
	}
	exhaust("198.51.100.1")

	// A second IP starts with a fresh budget even though the first is
	// already exhausted.
	ctxOtherIP := httpx.WithRequestMeta(context.Background(), httpx.RequestMeta{IP: "198.51.100.2"})
	_, err := handler(ctxOtherIP, rec, req, nil)
	require.NoError(t, err)

	// The first IP is still blocked.
	ctxFirstIP := httpx.WithRequestMeta(context.Background(), httpx.RequestMeta{IP: "198.51.100.1"})
	_, err = handler(ctxFirstIP, rec, req, nil)
	require.Error(t, err)
}

func TestPublicIPRateLimitStrictMiddleware_UnlistedOperationPassesThrough(t *testing.T) {
	store := auth.NewMemoryStore()
	mw := publicIPRateLimitStrictMiddleware(store)

	calls := 0
	next := func(ctx context.Context, w http.ResponseWriter, r *http.Request, request any) (any, error) {
		calls++
		return "ok", nil
	}
	// An operation not in publicIPRateLimits (e.g. an authenticated,
	// permissioned operation) must be handed back unwrapped: no budget,
	// no counter.
	handler := mw(next, "SomeAuthenticatedOperationNotInTheMap")

	ctx := httpx.WithRequestMeta(context.Background(), httpx.RequestMeta{IP: "203.0.113.9"})
	req := httptest.NewRequest(http.MethodGet, "/v1/whatever", nil)
	rec := httptest.NewRecorder()

	for i := 0; i < 1000; i++ {
		_, err := handler(ctx, rec, req, nil)
		require.NoError(t, err)
	}
	require.Equal(t, 1000, calls)
}

func TestPublicIPRateLimitStrictMiddleware_CoversEveryDocumentedPublicOperation(t *testing.T) {
	// Every operation this task's brief names as reachable without login
	// must carry a budget, so a future refactor that silently drops one
	// from the map fails a test instead of shipping unlimited.
	want := []string{
		"VerifyDocument",
		"SearchOpacTitles",
		"GetOpacTitleDetail",
		"GetOpacHighlights",
		"GetTenantBranding",
		"LookupTenants",
		"VerifyWhatsAppWebhook",
		"ReceiveWhatsAppWebhook",
		"GetGoogleSSOAvailability",
		"LoginWithGoogle",
		"BeginPasskeyLogin",
		"IssueLibraryKioskToken",
		"ScanLibraryKioskVisit",
	}
	for _, operationID := range want {
		budget, ok := publicIPRateLimits[operationID]
		require.Truef(t, ok, "%s must have a per-IP rate limit budget", operationID)
		require.Positivef(t, budget.limit, "%s budget must be positive", operationID)
		require.Positivef(t, budget.window, "%s window must be positive", operationID)
	}
}
