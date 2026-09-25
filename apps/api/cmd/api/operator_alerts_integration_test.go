package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

const operatorAlertsPath = "/v1/platform/operator-alerts"

// loginAndGetAccessToken logs username in through the real /v1/auth/login
// endpoint and returns its access token, so every operator-alerts request
// below travels through the exact same authentication path production
// does, not a hand-minted token.
func loginAndGetAccessToken(t *testing.T, server http.Handler, username, password string) string {
	t.Helper()
	rec := doJSON(t, server, http.MethodPost, "/v1/auth/login", map[string]any{
		"username": username, "password": password, "client": "web",
	}, nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	return body["access_token"].(string)
}

// TestOperatorAlertsRequiresPlatformSuperadmin proves a tenant admin --
// someone authenticated but without the platform_superadmin permission --
// is refused with 403 FORBIDDEN on every operator-alerts operation, the
// same authorization gate every other platform console endpoint uses.
func TestOperatorAlertsRequiresPlatformSuperadmin(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()

	// A tenant admin with real permissions, just not this one: proves the
	// 403 is about platform_superadmin specifically, not "no permissions
	// at all".
	seedTenantWithUser(t, ctx, pg.AdminPool, "oa-tenant-admin", "tenantadmin", "Password123!",
		[]string{authz.PermViewDashboard, authz.PermManageSettings})
	server := newTestServer(t, pg.DSN, pg.AppPool)
	token := loginAndGetAccessToken(t, server, "tenantadmin", "Password123!")
	auth := map[string]string{"Authorization": "Bearer " + token}

	rec := doJSON(t, server, http.MethodGet, operatorAlertsPath, nil, auth)
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	errBody := body["error"].(map[string]any)
	require.Equal(t, "FORBIDDEN", errBody["code"])

	rec = doJSON(t, server, http.MethodPut, operatorAlertsPath, map[string]any{"enabled": true}, auth)
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())

	rec = doJSON(t, server, http.MethodPost, operatorAlertsPath+"/detect-chat", nil, auth)
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())

	rec = doJSON(t, server, http.MethodPost, operatorAlertsPath+"/test", nil, auth)
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
}

// TestOperatorAlertsHTTPRoundTrip exercises GET/PUT through the full HTTP
// stack (auth, openapi request validation, authz, the platform handler)
// as a platform superadmin, and proves the token this test submits never
// reappears anywhere in a /v1 response body -- only telegram_token_set and
// a short masked hint do.
func TestOperatorAlertsHTTPRoundTrip(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()

	seedTenantWithUser(t, ctx, pg.AdminPool, "oa-superadmin", "superadmin", "Password123!",
		[]string{authz.PermPlatformSuperadmin})
	server := newTestServer(t, pg.DSN, pg.AppPool)
	token := loginAndGetAccessToken(t, server, "superadmin", "Password123!")
	auth := map[string]string{"Authorization": "Bearer " + token}

	rec := doJSON(t, server, http.MethodGet, operatorAlertsPath, nil, auth)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var settings map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &settings))
	require.Equal(t, false, settings["telegram_token_set"])
	require.NotContains(t, settings, "telegram_token")
	require.NotContains(t, settings, "telegram_bot_token")

	const secretToken = "123456789:AAHl-super-secret-bot-token-value"
	rec = doJSON(t, server, http.MethodPut, operatorAlertsPath, map[string]any{
		"enabled": true, "telegram_token": secretToken, "telegram_chat_id": "-1009876543210",
		"disk_threshold_percent": 90,
	}, auth)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NotContains(t, rec.Body.String(), secretToken, "the submitted token must never be echoed back")

	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &settings))
	require.Equal(t, true, settings["telegram_token_set"])
	require.Equal(t, "-1009876543210", settings["telegram_chat_id"])
	require.Equal(t, float64(90), settings["disk_threshold_percent"])
	hint, ok := settings["telegram_token_hint"].(string)
	require.True(t, ok, "a hint must be present once a token is stored")
	require.NotEqual(t, secretToken, hint, "the hint must never be (or equal) the raw secret")

	// Re-fetching confirms persistence and that the token still never
	// appears.
	rec = doJSON(t, server, http.MethodGet, operatorAlertsPath, nil, auth)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NotContains(t, rec.Body.String(), secretToken)
}

// TestMonitorConfigEndpoint proves the three properties
// GET /internal/monitor-config must have: unreachable without the shared
// secret header, disabled (404) when MONITOR_API_TOKEN is empty, and that
// this token never appears in an ordinary /v1 response (the operator
// alerts console API never returns it at all, per
// TestOperatorAlertsHTTPRoundTrip above).
func TestMonitorConfigEndpoint(t *testing.T) {
	pg := dbtest.Start(t)

	t.Run("disabled (404) when MONITOR_API_TOKEN is empty", func(t *testing.T) {
		server := newTestServer(t, pg.DSN, pg.AppPool) // testConfig leaves MonitorAPIToken empty
		rec := doJSON(t, server, http.MethodGet, "/internal/monitor-config", nil,
			map[string]string{"X-Monitor-Token": "whatever"})
		require.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("not reachable without the header, reachable with it", func(t *testing.T) {
		cfg := testConfig(pg.DSN)
		cfg.MonitorAPIToken = "a-shared-monitor-secret"
		logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
		router, _, err := buildRouter(cfg, logger, pg.AppPool, nil, "test")
		require.NoError(t, err)

		rec := doJSON(t, router, http.MethodGet, "/internal/monitor-config", nil, nil)
		require.Equal(t, http.StatusUnauthorized, rec.Code, "no X-Monitor-Token header must be rejected")

		rec = doJSON(t, router, http.MethodGet, "/internal/monitor-config", nil,
			map[string]string{"X-Monitor-Token": "wrong-secret"})
		require.Equal(t, http.StatusUnauthorized, rec.Code, "a wrong token must be rejected")

		rec = doJSON(t, router, http.MethodGet, "/internal/monitor-config", nil,
			map[string]string{"X-Monitor-Token": cfg.MonitorAPIToken})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var config map[string]any
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &config))
		// The full config, including the decrypted token field, is this
		// endpoint's entire contract -- unlike every /v1 response, it is
		// allowed (expected) to carry the field, just never a stale/wrong
		// value silently.
		require.Contains(t, config, "telegram_bot_token")
	})
}
