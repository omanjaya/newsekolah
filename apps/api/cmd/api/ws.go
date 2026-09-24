package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	attendancehttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// monitorSnapshotReader is the narrow slice of attendance/service.Service
// wsMonitorHandler needs to send the initial snapshot on connect, so this
// file does not have to depend on the whole attendance module wiring.
type monitorSnapshotReader interface {
	GetMonitorSnapshot(ctx context.Context, tenantID uuid.UUID) (attendanceservice.MonitorSnapshot, error)
}

// sessionRevocationCheckInterval bounds how long a revoked or expired
// session can keep its socket open after logout/refresh-reuse/password
// change: worst case, this interval, on top of however long the browser
// takes to notice the close (docs/analysis/backend-inventory.md section
// 1.6.1 -- the old app checked on connect only, never again).
const sessionRevocationCheckInterval = 60 * time.Second

// presenceHeartbeatInterval is how often a live /ws/me connection refreshes
// its own presence entry (see heartbeatPresence). It must stay well under
// realtime.Presence's own ttl (cmd/api/wire.go's presenceTTL, 90s) so a
// connection that is still open never goes stale in GET
// /v1/monitor/presence's snapshot between two heartbeats.
const presenceHeartbeatInterval = 30 * time.Second

// watchSessionValidity closes client the moment sessionID stops being
// active (revoked, expired) or the connection itself ends, whichever
// comes first. Runs in its own goroutine for the life of one WebSocket
// connection.
func watchSessionValidity(client *realtime.Client, sessions auth.SessionLookup, tenantID, sessionID uuid.UUID) {
	ticker := time.NewTicker(sessionRevocationCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-client.Done():
			return
		case <-ticker.C:
			active, err := sessions.IsSessionActive(context.Background(), tenantID, sessionID)
			if err != nil || !active {
				client.Close()
				return
			}
		}
	}
}

// heartbeatPresence refreshes presence's last-seen time for key every
// interval, for as long as client stays connected, so a long-lived /ws/me
// session keeps counting as "online" in GET /v1/monitor/presence instead
// of only ever heartbeating once at connect time (the previous behaviour:
// docs/15-paritas-sion.md's "Heartbeat presence pengguna online" gap) and
// then quietly going stale -- and, past realtime.Presence's ttl, dropping
// out of the snapshot entirely -- while the socket is still open. It stops
// the moment client disconnects (client.Done() closes), whether that is a
// clean close, a network drop caught by the ping/pong deadline, or
// watchSessionValidity closing it after revocation; wsMeHandler's onClose
// callback still does the actual presence.Remove on disconnect, so a
// closed connection is never left heartbeating a key nothing will ever
// clean up. Runs in its own goroutine for the life of one WebSocket
// connection, mirroring watchSessionValidity above.
func heartbeatPresence(client *realtime.Client, presence *realtime.Presence, key string, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-client.Done():
			return
		case <-ticker.C:
			presence.Heartbeat(context.Background(), key, time.Now())
		}
	}
}

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
func mountRealtimeRoutes(router chi.Router, pool *pgxpool.Pool, tokenIssuer *auth.TokenIssuer, sessions auth.SessionLookup, hub *realtime.Hub, presence *realtime.Presence, snapshots monitorSnapshotReader, appOrigins []string, logger *slog.Logger) {
	router.Get("/ws/me", wsMeHandler(tokenIssuer, sessions, hub, presence, appOrigins, logger))
	router.Get("/ws/monitor", wsMonitorHandler(pool, hub, snapshots, appOrigins, logger))
}

// wsMeHandler authenticates the caller's access token (header or
// subprotocol -- see realtime.ExtractBearer), checks the session it names
// is still active (a logged-out or revoked session must not get a live
// socket just because its access token has not expired yet), and
// subscribes them to their own per-user topic, so any module can later
// push to "user:<tenant>:<user>" without knowing how the socket was
// opened. watchSessionValidity keeps checking for the life of the
// connection so a revocation after connect closes it too. It also
// heartbeats presence (GET /v1/monitor/presence): the key is
// "<tenant>:<role>:<user>" so attendance/module.go's livePresence can both
// scope a snapshot to one tenant and recover each connection's role for
// the per-role counts. heartbeatPresence keeps re-heartbeating that key
// every presenceHeartbeatInterval for the life of the connection, so a
// long-lived session stays "online" instead of aging out of the snapshot
// after realtime.Presence's ttl from only the one heartbeat sent here at
// connect time.
func wsMeHandler(tokenIssuer *auth.TokenIssuer, sessions auth.SessionLookup, hub *realtime.Hub, presence *realtime.Presence, appOrigins []string, logger *slog.Logger) http.HandlerFunc {
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

		sessionID, err := uuid.Parse(claims.SessionID)
		if err != nil {
			http.Error(w, "invalid session", http.StatusUnauthorized)
			return
		}
		active, err := sessions.IsSessionActive(r.Context(), t.ID, sessionID)
		if err != nil || !active {
			http.Error(w, "session is no longer active", http.StatusUnauthorized)
			return
		}

		role := "unknown"
		if len(claims.Roles) > 0 {
			role = claims.Roles[0]
		}
		presenceKey := claims.TenantID + ":" + role + ":" + claims.Subject
		presence.Heartbeat(r.Context(), presenceKey, time.Now())

		topic := "user:" + claims.TenantID + ":" + claims.Subject
		client, err := realtime.Upgrade(w, r, hub, topic, appOrigins, logger, func() { presence.Remove(presenceKey) })
		if err != nil {
			logger.Warn("ws/me upgrade failed", "error", err)
			presence.Remove(presenceKey)
			return
		}
		// watchSessionValidity uses context.Background() internally by
		// design, not by oversight: per its doc comment, it runs for the
		// life of the WebSocket connection, which outlives this request's
		// context, so tying it to r.Context() would cancel the watcher the
		// moment this upgrade handler returns.
		// #nosec G118 -- see watchSessionValidity's doc comment
		go watchSessionValidity(client, sessions, t.ID, sessionID) //nolint:gosec // see watchSessionValidity's doc comment
		// heartbeatPresence uses context.Background() internally for the
		// same reason watchSessionValidity does above.
		// #nosec G118 -- see heartbeatPresence's doc comment
		go heartbeatPresence(client, presence, presenceKey, presenceHeartbeatInterval) //nolint:gosec // see heartbeatPresence's doc comment
	}
}

// wsMonitorHandler gates the connection with the same tenant-configured
// monitor.display_token setting GET /v1/monitor/snapshot uses, passed as a
// query parameter since browsers cannot set a custom header before the
// handshake completes (see attendance.yaml's wsMonitor summary). It reads
// the setting directly via gen/db rather than through the (not yet built)
// attendance or school service, since this is wiring code, not business
// logic.
func wsMonitorHandler(pool *pgxpool.Pool, hub *realtime.Hub, snapshots monitorSnapshotReader, appOrigins []string, logger *slog.Logger) http.HandlerFunc {
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

		// tenant_settings is RLS-protected (row level security section of
		// docs/06-database-schema.md): reading it on the raw pool, outside
		// database.WithTenantTx, only ever sees rows when the connection
		// happens to run under a superuser (dev) -- under app_rw it would
		// always deny the row and report "not configured" even when it is.
		var raw []byte
		err := database.WithTenantTx(r.Context(), pool, t.ID, func(ctx context.Context) error {
			tx, ok := database.TxFromContext(ctx)
			if !ok {
				return errors.New("tenant transaction missing from context")
			}
			var err error
			raw, err = db.New(tx).GetTenantSettingValue(ctx, db.GetTenantSettingValueParams{TenantID: t.ID, Key: settingKey})
			return err
		})
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
		client, err := realtime.Upgrade(w, r, hub, topic, appOrigins, logger)
		if err != nil {
			logger.Warn("ws/monitor upgrade failed", "error", err)
			return
		}

		// Send the current snapshot immediately: monitor_update (the only
		// other message this topic carries) only fires on the next
		// submission, so without this a display that connects mid-period
		// would show nothing until something happens
		// (docs/analysis/backend-inventory.md section 1.6: the old app's
		// "monitoring_ready" on connect).
		if snapshots != nil {
			if snap, err := snapshots.GetMonitorSnapshot(r.Context(), t.ID); err == nil {
				if payload, err := json.Marshal(struct {
					Type    string              `json:"type"`
					Payload api.MonitorSnapshot `json:"payload"`
				}{Type: "monitor_ready", Payload: attendancehttp.ToAPIMonitorSnapshot(snap)}); err == nil {
					client.Send(payload)
				}
			}
		}
	}
}
