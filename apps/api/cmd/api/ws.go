package main

import (
	"crypto/subtle"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// mountRealtimeRoutes wires the two WebSocket upgrade endpoints directly
// onto router, bypassing the strict handler chain entirely: a strict
// handler can only ever write a JSON response body, never hijack the
// connection for the handshake, so api.StrictServerInterface's WsMe and
// WsMonitor (implemented by the attendance module's transport as an honest
// 501, since attendance owns them per attendance.yaml's monitor tag) can
// never be more than a compile-time stub. chi's routing tree lets the last
// registration for a given method+pattern win with no error (unlike
// net/http's ServeMux, which panics on a duplicate pattern), so mounting
// these two routes after api.HandlerFromMux(strict, router) in wire.go
// simply replaces its generated GET /ws/me and GET /ws/monitor stubs with
// the real upgrade -- no double registration, and the routes still run
// behind every middleware already attached to router (tenant resolution
// in particular, which both handlers below depend on).
func mountRealtimeRoutes(router chi.Router, pool *pgxpool.Pool, tokenIssuer *auth.TokenIssuer, hub *realtime.Hub, presence *realtime.Presence, appOrigins []string, logger *slog.Logger) {
	router.Get("/ws/me", wsMeHandler(tokenIssuer, hub, presence, appOrigins, logger))
	router.Get("/ws/monitor", wsMonitorHandler(pool, hub, appOrigins, logger))
}

// wsMeHandler authenticates the caller's access token (header or
// subprotocol -- see realtime.ExtractBearer) and subscribes them to their
// own per-user topic, so any module can later push to "user:<tenant>:<user>"
// without knowing how the socket was opened. It also heartbeats presence
// (docs/analysis/backend-inventory.md section 1.14, GET
// /v1/monitor/presence): the key is "<tenant>:<role>:<user>" so
// attendance/module.go's livePresence can both scope a snapshot to one
// tenant and recover each connection's role for the per-role counts.
func wsMeHandler(tokenIssuer *auth.TokenIssuer, hub *realtime.Hub, presence *realtime.Presence, appOrigins []string, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, _, ok := realtime.ExtractBearer(r)
		if !ok {
			http.Error(w, "missing bearer token", http.StatusUnauthorized)
			return
		}
		claims, err := tokenIssuer.VerifyAccessToken(token)
		if err != nil {
			http.Error(w, "invalid or expired token", http.StatusUnauthorized)
			return
		}

		t, ok := tenant.FromContext(r.Context())
		if !ok || t.ID.String() != claims.TenantID {
			http.Error(w, "token does not match resolved tenant", http.StatusUnauthorized)
			return
		}

		role := "unknown"
		if len(claims.Roles) > 0 {
			role = claims.Roles[0]
		}
		presenceKey := claims.TenantID + ":" + role + ":" + claims.Subject
		presence.Heartbeat(r.Context(), presenceKey, time.Now())

		topic := "user:" + claims.TenantID + ":" + claims.Subject
		if _, err := realtime.Upgrade(w, r, hub, topic, appOrigins, logger, func() { presence.Remove(presenceKey) }); err != nil {
			logger.Warn("ws/me upgrade failed", "error", err)
			presence.Remove(presenceKey)
		}
	}
}

// wsMonitorHandler gates the connection with the same tenant-configured
// monitor.display_token setting GET /v1/monitor/snapshot uses, passed as a
// query parameter since browsers cannot set a custom header before the
// handshake completes (see attendance.yaml's wsMonitor summary). It reads
// the setting directly via gen/db rather than through the (not yet built)
// attendance or school service, since this is wiring code, not business
// logic.
func wsMonitorHandler(pool *pgxpool.Pool, hub *realtime.Hub, appOrigins []string, logger *slog.Logger) http.HandlerFunc {
	const settingKey = "monitor.display_token"

	return func(w http.ResponseWriter, r *http.Request) {
		t, ok := tenant.FromContext(r.Context())
		if !ok {
			http.Error(w, "tenant not resolved", http.StatusUnauthorized)
			return
		}

		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "missing token", http.StatusUnauthorized)
			return
		}

		raw, err := db.New(pool).GetTenantSettingValue(r.Context(), db.GetTenantSettingValueParams{TenantID: t.ID, Key: settingKey})
		if err != nil {
			http.Error(w, "monitor display is not configured for this school", http.StatusUnauthorized)
			return
		}
		var configured string
		if err := json.Unmarshal(raw, &configured); err != nil || configured == "" ||
			subtle.ConstantTimeCompare([]byte(configured), []byte(token)) != 1 {
			http.Error(w, "invalid monitor token", http.StatusUnauthorized)
			return
		}

		topic := "monitor:" + t.ID.String()
		if _, err := realtime.Upgrade(w, r, hub, topic, appOrigins, logger); err != nil {
			logger.Warn("ws/monitor upgrade failed", "error", err)
		}
	}
}
