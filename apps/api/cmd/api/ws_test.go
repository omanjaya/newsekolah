package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
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
		go heartbeatPresence(client, presence, key, interval)
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
		go heartbeatPresence(client, presence, key, interval)
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
