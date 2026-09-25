package realtime_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
)

// TestHubDeliversToSubscriber exercises the full stack end to end with a
// real WebSocket client (as required by the module brief), not a mock: an
// httptest server upgrades the connection through realtime.Upgrade, and
// Hub.Publish must reach it.
func TestHubDeliversToSubscriber(t *testing.T) {
	hub := realtime.NewHub(nil)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := realtime.Upgrade(w, r, hub, "monitor:tenant-1", nil, nil)
		require.NoError(t, err)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil) //nolint:bodyclose // closed below
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	defer func() { _ = conn.Close() }()

	// Give the server goroutine a moment to register the subscription
	// before we publish, since Upgrade returns as soon as the handshake
	// completes but Subscribe happens a line later.
	require.Eventually(t, func() bool {
		return hub.TopicSize("monitor:tenant-1") == 1
	}, time.Second, 10*time.Millisecond)

	type event struct {
		Kind string `json:"kind"`
	}
	require.NoError(t, hub.Publish("monitor:tenant-1", event{Kind: "session_submitted"}))

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(2*time.Second)))
	_, payload, err := conn.ReadMessage()
	require.NoError(t, err)

	var got event
	require.NoError(t, json.Unmarshal(payload, &got))
	require.Equal(t, "session_submitted", got.Kind)
}

// TestHubDoesNotDeliverToOtherTopics makes sure topics are actually
// isolated: a client on "user:a" must not see a publish to "user:b".
func TestHubDoesNotDeliverToOtherTopics(t *testing.T) {
	hub := realtime.NewHub(nil)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := realtime.Upgrade(w, r, hub, "user:a", nil, nil)
		require.NoError(t, err)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil) //nolint:bodyclose // closed below
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	defer func() { _ = conn.Close() }()

	require.Eventually(t, func() bool {
		return hub.TopicSize("user:a") == 1
	}, time.Second, 10*time.Millisecond)

	require.NoError(t, hub.Publish("user:b", map[string]string{"kind": "noise"}))

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(200*time.Millisecond)))
	_, _, err = conn.ReadMessage()
	require.Error(t, err, "must not receive a message published to a different topic")
}

// TestUnsubscribeOnDisconnect confirms a closed client is dropped from its
// topic so Publish stops iterating over dead connections.
func TestUnsubscribeOnDisconnect(t *testing.T) {
	hub := realtime.NewHub(nil)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := realtime.Upgrade(w, r, hub, "user:a", nil, nil)
		require.NoError(t, err)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil) //nolint:bodyclose // closed below
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}

	require.Eventually(t, func() bool {
		return hub.TopicSize("user:a") == 1
	}, time.Second, 10*time.Millisecond)

	require.NoError(t, conn.Close())

	require.Eventually(t, func() bool {
		return hub.TopicSize("user:a") == 0
	}, time.Second, 10*time.Millisecond)
}

// fakeBroadcaster simulates Redis pub-sub: unlike a real single-process
// nil-broadcaster setup, a subscriber here receives every message
// published to its topic -- including the ones this same process just
// published -- exactly like a real Redis SUBSCRIBE does for its own
// PUBLISH. It exists to exercise Hub's source-id dedup logic, which a
// nil-broadcaster test (every other test in this file) never touches.
type fakeBroadcaster struct {
	mu       sync.Mutex
	handlers map[string][]func(payload []byte)
}

func newFakeBroadcaster() *fakeBroadcaster {
	return &fakeBroadcaster{handlers: make(map[string][]func(payload []byte))}
}

func (b *fakeBroadcaster) Publish(_ context.Context, topic string, payload []byte) error {
	b.mu.Lock()
	handlers := append([]func([]byte){}, b.handlers[topic]...)
	b.mu.Unlock()
	for _, h := range handlers {
		h(payload)
	}
	return nil
}

func (b *fakeBroadcaster) Subscribe(ctx context.Context, topic string, handle func(payload []byte)) {
	b.mu.Lock()
	b.handlers[topic] = append(b.handlers[topic], handle)
	b.mu.Unlock()
	<-ctx.Done()
}

// TestHubDedupesOwnMessagesInMultiReplicaMode reproduces the bug a
// multi-replica deployment would hit without the source-id tag: a
// Broadcaster that echoes a publisher's own message back (as Redis
// pub-sub does) must not cause that publisher's local clients to receive
// the message twice.
func TestHubDedupesOwnMessagesInMultiReplicaMode(t *testing.T) {
	hub := realtime.NewHub(newFakeBroadcaster())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := realtime.Upgrade(w, r, hub, "user:a", nil, nil)
		require.NoError(t, err)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil) //nolint:bodyclose // closed below
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	defer func() { _ = conn.Close() }()

	require.Eventually(t, func() bool {
		return hub.TopicSize("user:a") == 1
	}, time.Second, 10*time.Millisecond)

	require.NoError(t, hub.Publish("user:a", map[string]string{"kind": "notification_created"}))

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(2*time.Second)))
	_, _, err = conn.ReadMessage()
	require.NoError(t, err, "must receive the message once")

	// A second read must time out: the broadcaster echoed the same
	// message back (simulating Redis delivering a publisher's own
	// message to its own subscription), and Hub must have dropped it by
	// source id instead of delivering it again.
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(200*time.Millisecond)))
	_, _, err = conn.ReadMessage()
	require.Error(t, err, "must not receive the same message twice")
}

// TestPublishOnlyHubReachesSubscriberOnSeparateHub proves the shape
// cmd/worker/main.go's Hub relies on: a Hub that never Subscribes any
// local client -- exactly what a background-job process that never serves
// a WebSocket upgrade looks like, unlike cmd/api's own Hub -- can still
// push an event that reaches a client connected to a *different*
// process's Hub, purely through the shared Broadcaster. fakeBroadcaster
// stands in for Redis pub-sub here (this repo has no Redis testcontainers
// module or miniredis dependency yet; it implements the same Broadcaster
// contract RedisBroadcaster does over a real REDIS_URL, so this proves the
// same fan-out RedisBroadcaster would perform in production).
func TestPublishOnlyHubReachesSubscriberOnSeparateHub(t *testing.T) {
	broadcaster := newFakeBroadcaster()

	// workerHub stands in for cmd/worker's hub: nothing ever calls
	// Subscribe on it (no mountRealtimeRoutes, no Upgrade -- see
	// cmd/worker/main.go's hub construction comment), so it never gains a
	// local client and its own watchRemote is never started either.
	workerHub := realtime.NewHub(broadcaster)

	// apiHub stands in for cmd/api's hub, in a different process, with one
	// real WebSocket client connected the way GET /ws/me's wsMeHandler
	// does.
	apiHub := realtime.NewHub(broadcaster)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := realtime.Upgrade(w, r, apiHub, "user:tenant-1:user-1", nil, nil)
		require.NoError(t, err)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil) //nolint:bodyclose // closed below
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	defer func() { _ = conn.Close() }()

	require.Eventually(t, func() bool {
		return apiHub.TopicSize("user:tenant-1:user-1") == 1
	}, time.Second, 10*time.Millisecond)

	// This is exactly what notifications/service.Notify's realtime.Publish
	// call does from inside a background job -- e.g. library's due
	// reminder job or a scheduled report's "ready" notification -- once
	// cmd/worker/main.go wires its own Hub into notifications.Dependencies.
	// Realtime.
	type event struct {
		Type string `json:"type"`
	}
	require.NoError(t, workerHub.Publish("user:tenant-1:user-1", event{Type: "notification_created"}))

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(2*time.Second)))
	_, payload, err := conn.ReadMessage()
	require.NoError(t, err, "the client on the separate hub must receive the worker's publish")

	var got event
	require.NoError(t, json.Unmarshal(payload, &got))
	assert.Equal(t, "notification_created", got.Type)

	// workerHub itself never gained a local subscriber -- confirms the
	// message really travelled the cross-process (Broadcaster) path, not
	// local delivery within one Hub.
	assert.Equal(t, 0, workerHub.TopicSize("user:tenant-1:user-1"))
}

// TestHubPublishEventDeliversEnvelope proves PublishEvent (envelope.go,
// hub.go) reaches a local subscriber wrapped in the standard Envelope,
// instead of each call site shaping its own JSON (docs/analysis/
// realtime-plan-2026-09-25.md section 3.1) -- deliverLocal's local-delivery
// path is the same one Publish already exercises in
// TestHubDeliversToSubscriber above; this only adds the Envelope wrapping.
func TestHubPublishEventDeliversEnvelope(t *testing.T) {
	hub := realtime.NewHub(nil)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := realtime.Upgrade(w, r, hub, "duty:tenant-1:duty_teacher", nil, nil)
		require.NoError(t, err)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil) //nolint:bodyclose // closed below
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	defer func() { _ = conn.Close() }()

	require.Eventually(t, func() bool {
		return hub.TopicSize("duty:tenant-1:duty_teacher") == 1
	}, time.Second, 10*time.Millisecond)

	type instancePayload struct {
		InstanceID string `json:"instance_id"`
	}
	require.NoError(t, hub.PublishEvent("duty:tenant-1:duty_teacher", "late_arrival.opened", instancePayload{InstanceID: "inst-1"}))

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(2*time.Second)))
	_, wire, err := conn.ReadMessage()
	require.NoError(t, err)

	var got realtime.Envelope
	require.NoError(t, json.Unmarshal(wire, &got))
	require.Equal(t, "late_arrival.opened", got.Type)
	require.Equal(t, "duty:tenant-1:duty_teacher", got.Topic)
	require.False(t, got.At.IsZero())

	var payload instancePayload
	require.NoError(t, json.Unmarshal(got.Payload, &payload))
	require.Equal(t, "inst-1", payload.InstanceID)
}

func TestExtractBearer(t *testing.T) {
	t.Run("authorization header", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/ws/me", nil)
		r.Header.Set("Authorization", "Bearer abc123")
		token, subprotocol, ok := realtime.ExtractBearer(r)
		require.True(t, ok)
		require.Equal(t, "abc123", token)
		require.Empty(t, subprotocol)
	})

	t.Run("subprotocol convention for browsers", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/ws/me", nil)
		r.Header.Set("Sec-WebSocket-Protocol", "bearer.abc123, other")
		token, subprotocol, ok := realtime.ExtractBearer(r)
		require.True(t, ok)
		require.Equal(t, "abc123", token)
		require.Equal(t, "bearer.abc123", subprotocol)
	})

	t.Run("neither present", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/ws/me", nil)
		_, _, ok := realtime.ExtractBearer(r)
		require.False(t, ok)
	})
}

func TestOriginChecker(t *testing.T) {
	check := realtime.OriginChecker([]string{"https://app.example.test"})

	allowed := httptest.NewRequest(http.MethodGet, "/ws/me", nil)
	allowed.Header.Set("Origin", "https://app.example.test")
	require.True(t, check(allowed))

	denied := httptest.NewRequest(http.MethodGet, "/ws/me", nil)
	denied.Header.Set("Origin", "https://evil.example.test")
	require.False(t, check(denied))

	noOrigin := httptest.NewRequest(http.MethodGet, "/ws/me", nil)
	require.True(t, check(noOrigin), "native clients send no Origin header")
}
