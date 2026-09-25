package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestHeartbeatPresenceRefreshesWhileConnected proves heartbeatPresence
// keeps a connection's presence entry alive for as long as the socket
// stays open, not only once at connect time: with a ttl short enough that
// a single heartbeat would already have expired, the key must still be
// present after several of heartbeatPresence's own ticks have had a
// chance to fire.
func TestHeartbeatPresenceRefreshesWhileConnected(t *testing.T) {
	const (
		interval = 20 * time.Millisecond
		ttl      = 50 * time.Millisecond
	)
	presence := realtime.NewPresence(nil, ttl)
	hub := realtime.NewHub(nil)
	const key = "tenant-1:teacher:user-1"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		client, err := realtime.Upgrade(w, r, hub, "user:tenant-1:user-1", nil, nil)
		require.NoError(t, err)
		go heartbeatPresence(client, presence, key, interval, clock.Real{})
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil) //nolint:bodyclose // closed below
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	defer func() { _ = conn.Close() }()

	// No heartbeat was ever sent at "connect time" here (unlike
	// wsMeHandler, which sends one before upgrading) -- every entry in
	// presence comes from heartbeatPresence's own ticker. Wait several
	// ttl windows: if heartbeatPresence only fired once, the key would
	// already be gone.
	require.Eventually(t, func() bool {
		snap := presence.Snapshot(context.Background(), time.Now())
		return len(snap) == 1 && snap[0] == key
	}, 5*ttl, interval, "key must stay present across multiple ttl windows while connected")

	require.Eventually(t, func() bool {
		snap := presence.Snapshot(context.Background(), time.Now())
		return len(snap) == 1 && snap[0] == key
	}, 5*ttl, interval, "key must still be refreshed after the first check")
}

// TestHeartbeatPresenceStopsOnDisconnect proves heartbeatPresence stops
// ticking once the connection closes: after disconnect, waiting past ttl
// with no further heartbeat must let the key expire, instead of the
// goroutine leaking and refreshing it forever.
func TestHeartbeatPresenceStopsOnDisconnect(t *testing.T) {
	const (
		interval = 20 * time.Millisecond
		ttl      = 50 * time.Millisecond
	)
	presence := realtime.NewPresence(nil, ttl)
	hub := realtime.NewHub(nil)
	const key = "tenant-1:teacher:user-1"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		client, err := realtime.Upgrade(w, r, hub, "user:tenant-1:user-1", nil, nil)
		require.NoError(t, err)
		go heartbeatPresence(client, presence, key, interval, clock.Real{})
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil) //nolint:bodyclose // closed below
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}

	require.Eventually(t, func() bool {
		snap := presence.Snapshot(context.Background(), time.Now())
		return len(snap) == 1
	}, 5*ttl, interval, "must be heartbeating while connected")

	require.NoError(t, conn.Close())

	// Once disconnected, no further heartbeat should land: after ttl has
	// fully elapsed with the ticker stopped, the key must expire and stay
	// expired.
	require.Eventually(t, func() bool {
		return len(presence.Snapshot(context.Background(), time.Now())) == 0
	}, 10*ttl, interval, "key must expire once the connection is closed and heartbeats stop")

	// Give it a couple more ticks' worth of time: if heartbeatPresence
	// leaked, the key would reappear.
	time.Sleep(3 * interval)
	require.Empty(t, presence.Snapshot(context.Background(), time.Now()), "a leaked heartbeat goroutine would have refreshed the key again")
}

// -- wsMeHandler's topic multiplexing (chunk B) --------------------------
//
// These tests exercise wsMeHandler itself (the full auth + upgrade path),
// rather than realtime.Multiplexer directly (already covered unit-by-unit
// in internal/platform/realtime/subscribe_test.go), to prove the wiring in
// wire.go/ws.go -- token verification, tenant resolution, DutyLookup
// injection -- actually reaches the Multiplexer intact. They mirror
// TestHeartbeatPresenceRefreshesWhileConnected above: a bare
// httptest.Server wrapping the handler directly, a fake SessionLookup and
// DutyLookup, no full router/Postgres.

// alwaysActiveSessions is a auth.SessionLookup stub that never revokes.
type alwaysActiveSessions struct{}

func (alwaysActiveSessions) IsSessionActive(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return true, nil
}

func (alwaysActiveSessions) TouchSessionLastSeen(context.Context, uuid.UUID, uuid.UUID) error {
	return nil
}

// fakeDutyLookup answers realtime.DutyLookup from an in-memory, mutable
// map, so a test can flip who holds a duty mid-connection.
type fakeDutyLookup struct {
	mu      sync.Mutex
	holders map[string][]uuid.UUID
}

func newFakeDutyLookup() *fakeDutyLookup {
	return &fakeDutyLookup{holders: make(map[string][]uuid.UUID)}
}

func (f *fakeDutyLookup) set(slug string, holders ...uuid.UUID) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.holders[slug] = holders
}

func (f *fakeDutyLookup) UsersWithDuty(_ context.Context, _ uuid.UUID, slug string, _ uuid.NullUUID) ([]uuid.UUID, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.holders[slug], nil
}

// wsMeTestFixture wires a bare wsMeHandler behind an httptest.Server with
// tenant resolution stubbed in directly (tenant.WithTenant), and mints
// access tokens against a fixed throwaway test key.
type wsMeTestFixture struct {
	server   *httptest.Server
	tenantID uuid.UUID
	issuer   *auth.TokenIssuer
}

func newWsMeTestFixture(t *testing.T, hub *realtime.Hub, duties realtime.DutyLookup) *wsMeTestFixture {
	t.Helper()
	key, err := auth.ParseSigningKey(testJWTSigningKey)
	require.NoError(t, err)
	issuer := auth.NewTokenIssuer(key, "test-issuer", 15*time.Minute)
	presence := realtime.NewPresence(nil, time.Minute)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	tenantID := uuid.New()

	handler := wsMeHandler(issuer, alwaysActiveSessions{}, duties, hub, presence, nil, logger, clock.Real{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := tenant.WithTenant(r.Context(), tenant.Tenant{ID: tenantID})
		handler(w, r.WithContext(ctx))
	}))
	t.Cleanup(server.Close)
	return &wsMeTestFixture{server: server, tenantID: tenantID, issuer: issuer}
}

// dial mints an access token for userID/roles and opens /ws/me with it,
// returning the connection past its "hello" message (see ws.go's package
// doc comment for the wire contract) so callers start reading from
// whatever they send/receive next.
func (f *wsMeTestFixture) dial(t *testing.T, userID uuid.UUID, roles []string) *websocket.Conn {
	t.Helper()
	token, _, err := f.issuer.IssueAccessToken(userID, f.tenantID, uuid.New(), roles, time.Now())
	require.NoError(t, err)

	wsURL := "ws" + strings.TrimPrefix(f.server.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, http.Header{"Authorization": []string{"Bearer " + token}}) //nolint:bodyclose // closed by caller/cleanup
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	t.Cleanup(func() { _ = conn.Close() })

	hello := wsReadEnvelope(t, conn, time.Second)
	require.Equal(t, "hello", hello.Type, "first message on a fresh /ws/me connection must be hello")
	return conn
}

func wsReadEnvelope(t *testing.T, conn *websocket.Conn, timeout time.Duration) realtime.Envelope {
	t.Helper()
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(timeout)))
	_, wire, err := conn.ReadMessage()
	require.NoError(t, err)
	var env realtime.Envelope
	require.NoError(t, json.Unmarshal(wire, &env))
	return env
}

func wsSendSubscribe(t *testing.T, conn *websocket.Conn, action string, topics ...string) {
	t.Helper()
	msg, err := json.Marshal(struct {
		Action string   `json:"action"`
		Topics []string `json:"topics"`
	}{Action: action, Topics: topics})
	require.NoError(t, err)
	require.NoError(t, conn.WriteMessage(websocket.TextMessage, msg))
}

// TestWsMeSubscribeRejectsRoleNotHeld proves a live /ws/me connection
// refuses a role topic the caller's own access token does not carry, with
// wiring (token -> claims.Roles -> Multiplexer) intact end to end.
func TestWsMeSubscribeRejectsRoleNotHeld(t *testing.T) {
	hub := realtime.NewHub(nil)
	fixture := newWsMeTestFixture(t, hub, nil)
	conn := fixture.dial(t, uuid.New(), []string{"teacher"})

	wsSendSubscribe(t, conn, "subscribe", "role:admin")
	ack := wsReadEnvelope(t, conn, time.Second)
	require.Equal(t, "subscribe_rejected", ack.Type)
}

// TestWsMeSubscribeRejectsDutyUntilLookupConfirms proves a duty topic is
// refused before the injected DutyLookup confirms the caller holds it,
// then granted once it does -- the DutyLookup wired all the way from
// wire.go's mountRealtimeRoutes call through to the Multiplexer.
func TestWsMeSubscribeRejectsDutyUntilLookupConfirms(t *testing.T) {
	hub := realtime.NewHub(nil)
	duties := newFakeDutyLookup()
	fixture := newWsMeTestFixture(t, hub, duties)
	userID := uuid.New()
	conn := fixture.dial(t, userID, nil)

	wsSendSubscribe(t, conn, "subscribe", "duty:counselor")
	rejected := wsReadEnvelope(t, conn, time.Second)
	require.Equal(t, "subscribe_rejected", rejected.Type)

	duties.set("counselor", userID)

	wsSendSubscribe(t, conn, "subscribe", "duty:counselor")
	granted := wsReadEnvelope(t, conn, time.Second)
	require.Equal(t, "subscribed", granted.Type)
	require.Equal(t, realtime.TopicDuty(fixture.tenantID, "counselor", uuid.NullUUID{}), granted.Topic)
}

// TestWatchDutySubscriptionsReleasesTopicWhenLookupFlips proves
// watchDutySubscriptions' periodic recheck (mirroring
// watchSessionValidity's ticker, per the plan) releases a granted duty
// topic the moment DutyLookup stops confirming it, without the connection
// itself closing. It mirrors TestHeartbeatPresenceRefreshesWhileConnected's
// style above (realtime.UpgradeWithHandler wired directly behind a bare
// httptest.Server, watchDutySubscriptions started with a short interval)
// rather than going through wsMeHandler/newWsMeTestFixture: wsMeHandler
// hardcodes the package's dutyRecheckInterval (60s in production), and
// this test must not wait a full minute for the first recheck to fire.
func TestWatchDutySubscriptionsReleasesTopicWhenLookupFlips(t *testing.T) {
	const interval = 20 * time.Millisecond
	hub := realtime.NewHub(nil)
	tenantID, userID := uuid.New(), uuid.New()
	duties := newFakeDutyLookup()
	duties.set("security", userID)
	topic := realtime.TopicUser(tenantID, userID)

	var mux *realtime.Multiplexer
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		client, err := realtime.UpgradeWithHandler(w, r, hub, topic, nil, nil, func(c *realtime.Client) func([]byte) {
			mux = realtime.NewMultiplexer(hub, c, tenantID, userID, nil, duties, nil)
			return mux.HandleMessage
		})
		require.NoError(t, err)
		go watchDutySubscriptions(client, mux, interval)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil) //nolint:bodyclose // closed below
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	defer func() { _ = conn.Close() }()

	wsSendSubscribe(t, conn, "subscribe", "duty:security")
	granted := wsReadEnvelope(t, conn, time.Second)
	require.Equal(t, "subscribed", granted.Type)
	dutyTopic := granted.Topic
	require.Equal(t, 1, hub.TopicSize(dutyTopic))

	// The duty holder changed mid-connection: fake DutyLookup now answers
	// "not held" for this user.
	duties.set("security", uuid.New())

	released := wsReadEnvelope(t, conn, time.Second)
	require.Equal(t, "unsubscribed", released.Type)
	require.Equal(t, dutyTopic, released.Topic)
	require.Equal(t, 0, hub.TopicSize(dutyTopic))

	// The connection itself must still be alive: only the duty topic was
	// released, not the whole socket.
	require.NoError(t, hub.PublishEvent(topic, "notification_created", map[string]string{}))
	own := wsReadEnvelope(t, conn, time.Second)
	require.Equal(t, "notification_created", own.Type)
}

// TestWsMeNeverDeliversAnotherTenantsEvents proves cross-tenant isolation
// through the full wsMeHandler path: two fixtures (two tenants) both grant
// "role:admin", but a publish scoped to one tenant's topic never reaches
// the other tenant's connection.
func TestWsMeNeverDeliversAnotherTenantsEvents(t *testing.T) {
	hub := realtime.NewHub(nil)
	fixtureA := newWsMeTestFixture(t, hub, nil)
	fixtureB := newWsMeTestFixture(t, hub, nil)
	connA := fixtureA.dial(t, uuid.New(), []string{"admin"})
	connB := fixtureB.dial(t, uuid.New(), []string{"admin"})

	wsSendSubscribe(t, connA, "subscribe", "role:admin")
	require.Equal(t, "subscribed", wsReadEnvelope(t, connA, time.Second).Type)
	wsSendSubscribe(t, connB, "subscribe", "role:admin")
	require.Equal(t, "subscribed", wsReadEnvelope(t, connB, time.Second).Type)

	require.NoError(t, hub.PublishEvent(realtime.TopicRole(fixtureA.tenantID, "admin"), "attendance.submitted", map[string]string{}))
	got := wsReadEnvelope(t, connA, time.Second)
	require.Equal(t, "attendance.submitted", got.Type)

	require.NoError(t, connB.SetReadDeadline(time.Now().Add(200*time.Millisecond)))
	_, _, err := connB.ReadMessage()
	require.Error(t, err, "tenant B's connection must never see tenant A's publish")
}

// TestWsMeStillDeliversLegacyNotificationCreated proves the base user
// topic's existing behaviour is untouched: a plain hub.Publish carrying
// exactly the shape notifications/service.Notify sends today
// ({"type":"notification_created","payload":{"title":...,"body":...}}, no
// envelope wrapping) must still reach a /ws/me connection unchanged, so
// apps/web/features/notifications/realtime.ts keeps working without any
// change on its side until chunk D replaces it.
func TestWsMeStillDeliversLegacyNotificationCreated(t *testing.T) {
	hub := realtime.NewHub(nil)
	fixture := newWsMeTestFixture(t, hub, nil)
	userID := uuid.New()
	conn := fixture.dial(t, userID, nil)

	type legacyPayload struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	type legacyEvent struct {
		Type    string        `json:"type"`
		Payload legacyPayload `json:"payload"`
	}
	require.NoError(t, hub.Publish(realtime.TopicUser(fixture.tenantID, userID), legacyEvent{
		Type: "notification_created", Payload: legacyPayload{Title: "Judul", Body: "Isi"},
	}))

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(time.Second)))
	_, wire, err := conn.ReadMessage()
	require.NoError(t, err)

	var got legacyEvent
	require.NoError(t, json.Unmarshal(wire, &got))
	require.Equal(t, "notification_created", got.Type)
	require.Equal(t, "Judul", got.Payload.Title)
	require.Equal(t, "Isi", got.Payload.Body)
}
