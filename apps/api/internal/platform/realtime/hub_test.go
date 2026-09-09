package realtime_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
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
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer conn.Close()

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
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer conn.Close()

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
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		return hub.TopicSize("user:a") == 1
	}, time.Second, 10*time.Millisecond)

	require.NoError(t, conn.Close())

	require.Eventually(t, func() bool {
		return hub.TopicSize("user:a") == 0
	}, time.Second, 10*time.Millisecond)
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
