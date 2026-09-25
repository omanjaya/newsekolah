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

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
)

// fakeDutyLookup answers realtime.DutyLookup from an in-memory, mutable
// map, so a test can flip whether a duty is held mid-connection (proving
// Multiplexer.RecheckDuties reacts to that) without a real Postgres
// duty_assignments row.
type fakeDutyLookup struct {
	mu      sync.Mutex
	holders map[string][]uuid.UUID // key: slug, or slug+":"+classID
}

func newFakeDutyLookup() *fakeDutyLookup {
	return &fakeDutyLookup{holders: make(map[string][]uuid.UUID)}
}

func dutyKey(slug string, classID uuid.NullUUID) string {
	if classID.Valid {
		return slug + ":" + classID.UUID.String()
	}
	return slug
}

func (f *fakeDutyLookup) set(slug string, classID uuid.NullUUID, holders ...uuid.UUID) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.holders[dutyKey(slug, classID)] = holders
}

func (f *fakeDutyLookup) UsersWithDuty(_ context.Context, _ uuid.UUID, slug string, classID uuid.NullUUID) ([]uuid.UUID, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.holders[dutyKey(slug, classID)], nil
}

// dialMultiplexed starts an httptest server that upgrades one connection
// through realtime.UpgradeWithHandler exactly as cmd/api/ws.go's
// wsMeHandler does: subscribed to its own base user topic, with a
// Multiplexer wired up to handle subscribe/unsubscribe frames. It returns
// the live client connection and the Multiplexer, so a test can both send
// wire messages and call RecheckDuties/Close directly.
func dialMultiplexed(t *testing.T, hub *realtime.Hub, tenantID, userID uuid.UUID, roles []string, duties realtime.DutyLookup) (*websocket.Conn, *realtime.Multiplexer) {
	t.Helper()
	topic := realtime.TopicUser(tenantID, userID)

	var mux *realtime.Multiplexer
	var ready sync.WaitGroup
	ready.Add(1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := realtime.UpgradeWithHandler(w, r, hub, topic, nil, nil, func(c *realtime.Client) func([]byte) {
			mux = realtime.NewMultiplexer(hub, c, tenantID, userID, roles, duties, nil)
			ready.Done()
			return mux.HandleMessage
		})
		require.NoError(t, err)
	}))
	t.Cleanup(server.Close)

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil) //nolint:bodyclose // closed by caller/cleanup
	require.NoError(t, err)
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	t.Cleanup(func() { _ = conn.Close() })

	ready.Wait()
	require.Eventually(t, func() bool { return hub.TopicSize(topic) == 1 }, time.Second, 10*time.Millisecond)
	return conn, mux
}

func sendSubscribe(t *testing.T, conn *websocket.Conn, action string, topics ...string) {
	t.Helper()
	msg, err := json.Marshal(struct {
		Action string   `json:"action"`
		Topics []string `json:"topics"`
	}{Action: action, Topics: topics})
	require.NoError(t, err)
	require.NoError(t, conn.WriteMessage(websocket.TextMessage, msg))
}

func readEnvelope(t *testing.T, conn *websocket.Conn, timeout time.Duration) realtime.Envelope {
	t.Helper()
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(timeout)))
	_, wire, err := conn.ReadMessage()
	require.NoError(t, err)
	var env realtime.Envelope
	require.NoError(t, json.Unmarshal(wire, &env))
	return env
}

// TestMultiplexerAllowsRoleTopicHeldInClaims proves the cheap path: a role
// present in the connection's own claims is granted without any DutyLookup
// call, and a subsequent publish to that topic reaches the connection.
func TestMultiplexerAllowsRoleTopicHeldInClaims(t *testing.T) {
	hub := realtime.NewHub(nil)
	tenantID, userID := uuid.New(), uuid.New()
	conn, _ := dialMultiplexed(t, hub, tenantID, userID, []string{"librarian"}, nil)

	sendSubscribe(t, conn, "subscribe", "role:librarian")
	ack := readEnvelope(t, conn, time.Second)
	require.Equal(t, "subscribed", ack.Type)
	require.Equal(t, realtime.TopicRole(tenantID, "librarian"), ack.Topic)

	require.NoError(t, hub.PublishEvent(realtime.TopicRole(tenantID, "librarian"), "library.reserved", map[string]string{"reservation_id": "r1"}))
	got := readEnvelope(t, conn, time.Second)
	require.Equal(t, "library.reserved", got.Type)
}

// TestMultiplexerRejectsRoleNotHeld proves a role absent from the
// connection's claims is refused -- and, just as important, that no
// publish to that topic reaches this connection afterward.
func TestMultiplexerRejectsRoleNotHeld(t *testing.T) {
	hub := realtime.NewHub(nil)
	tenantID, userID := uuid.New(), uuid.New()
	conn, _ := dialMultiplexed(t, hub, tenantID, userID, []string{"teacher"}, nil)

	sendSubscribe(t, conn, "subscribe", "role:admin")
	ack := readEnvelope(t, conn, time.Second)
	require.Equal(t, "subscribe_rejected", ack.Type)
	require.Equal(t, "role:admin", ack.Topic)

	var reason struct {
		Reason string `json:"reason"`
	}
	require.NoError(t, json.Unmarshal(ack.Payload, &reason))
	require.Equal(t, "role_not_held", reason.Reason)

	require.NoError(t, hub.PublishEvent(realtime.TopicRole(tenantID, "admin"), "some.event", map[string]string{}))
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(200*time.Millisecond)))
	_, _, err := conn.ReadMessage()
	require.Error(t, err, "must not receive a publish to a role topic it was never granted")
}

// TestMultiplexerRejectsDutyUntilLookupConfirms proves a duty topic is
// refused before DutyLookup confirms the caller holds it, then granted
// once it does -- exactly the two-step the plan requires (section 3.2).
func TestMultiplexerRejectsDutyUntilLookupConfirms(t *testing.T) {
	hub := realtime.NewHub(nil)
	tenantID, userID := uuid.New(), uuid.New()
	duties := newFakeDutyLookup()
	conn, _ := dialMultiplexed(t, hub, tenantID, userID, nil, duties)

	sendSubscribe(t, conn, "subscribe", "duty:duty_teacher")
	rejected := readEnvelope(t, conn, time.Second)
	require.Equal(t, "subscribe_rejected", rejected.Type)
	var reason struct {
		Reason string `json:"reason"`
	}
	require.NoError(t, json.Unmarshal(rejected.Payload, &reason))
	require.Equal(t, "duty_not_held", reason.Reason)

	duties.set("duty_teacher", uuid.NullUUID{}, userID)

	sendSubscribe(t, conn, "subscribe", "duty:duty_teacher")
	granted := readEnvelope(t, conn, time.Second)
	require.Equal(t, "subscribed", granted.Type)
	require.Equal(t, realtime.TopicDuty(tenantID, "duty_teacher", uuid.NullUUID{}), granted.Topic)
}

// TestMultiplexerReleasesDutyWhenLookupFlips proves the periodic release
// path: once a duty topic is granted, RecheckDuties must unsubscribe it
// the moment DutyLookup no longer confirms the duty -- e.g. a piket
// teacher's shift ending mid-connection -- and tell the client why.
func TestMultiplexerReleasesDutyWhenLookupFlips(t *testing.T) {
	hub := realtime.NewHub(nil)
	tenantID, userID := uuid.New(), uuid.New()
	duties := newFakeDutyLookup()
	duties.set("security", uuid.NullUUID{}, userID)
	conn, mux := dialMultiplexed(t, hub, tenantID, userID, nil, duties)

	sendSubscribe(t, conn, "subscribe", "duty:security")
	granted := readEnvelope(t, conn, time.Second)
	require.Equal(t, "subscribed", granted.Type)
	topic := realtime.TopicDuty(tenantID, "security", uuid.NullUUID{})
	require.Equal(t, 1, hub.TopicSize(topic))

	// The duty holder changed: fake DutyLookup now answers "not held".
	duties.set("security", uuid.NullUUID{}, uuid.New())

	mux.RecheckDuties(context.Background())
	released := readEnvelope(t, conn, time.Second)
	require.Equal(t, "unsubscribed", released.Type)
	require.Equal(t, topic, released.Topic)

	require.Equal(t, 0, hub.TopicSize(topic), "hub must have dropped the connection from the duty topic")

	require.NoError(t, hub.PublishEvent(topic, "late_arrival.opened", map[string]string{}))
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(200*time.Millisecond)))
	_, _, err := conn.ReadMessage()
	require.Error(t, err, "must not receive a publish to a duty topic it no longer holds")
}

// TestMultiplexerUserTopicOnlyForSelf proves a client can subscribe to its
// own user topic through the multiplex path, but never another user's,
// even though the connection is already authenticated.
func TestMultiplexerUserTopicOnlyForSelf(t *testing.T) {
	hub := realtime.NewHub(nil)
	tenantID, userID, otherID := uuid.New(), uuid.New(), uuid.New()
	conn, _ := dialMultiplexed(t, hub, tenantID, userID, nil, nil)

	sendSubscribe(t, conn, "subscribe", "user:"+otherID.String())
	rejected := readEnvelope(t, conn, time.Second)
	require.Equal(t, "subscribe_rejected", rejected.Type)

	sendSubscribe(t, conn, "subscribe", "user:"+userID.String())
	granted := readEnvelope(t, conn, time.Second)
	require.Equal(t, "subscribed", granted.Type)
	require.Equal(t, realtime.TopicUser(tenantID, userID), granted.Topic)
}

// TestMultiplexerNeverDeliversAnotherTenantsEvents proves cross-tenant
// isolation end to end through the multiplex path: two connections in
// different tenants both hold the "admin" role and both subscribe to
// "role:admin", yet a publish scoped to one tenant's topic never reaches
// the other tenant's connection.
func TestMultiplexerNeverDeliversAnotherTenantsEvents(t *testing.T) {
	hub := realtime.NewHub(nil)
	tenantA, tenantB := uuid.New(), uuid.New()
	userA, userB := uuid.New(), uuid.New()

	connA, _ := dialMultiplexed(t, hub, tenantA, userA, []string{"admin"}, nil)
	connB, _ := dialMultiplexed(t, hub, tenantB, userB, []string{"admin"}, nil)

	sendSubscribe(t, connA, "subscribe", "role:admin")
	require.Equal(t, "subscribed", readEnvelope(t, connA, time.Second).Type)
	sendSubscribe(t, connB, "subscribe", "role:admin")
	require.Equal(t, "subscribed", readEnvelope(t, connB, time.Second).Type)

	require.NoError(t, hub.PublishEvent(realtime.TopicRole(tenantA, "admin"), "attendance.submitted", map[string]string{}))

	got := readEnvelope(t, connA, time.Second)
	require.Equal(t, "attendance.submitted", got.Type)

	require.NoError(t, connB.SetReadDeadline(time.Now().Add(200*time.Millisecond)))
	_, _, err := connB.ReadMessage()
	require.Error(t, err, "tenant B's connection must never see tenant A's role:admin publish")
}

// TestMultiplexerCloseReleasesGrantedTopics proves disconnect cleanup:
// every topic granted beyond the base user topic must be released so the
// hub does not keep publishing to a dead client forever (docs/analysis/
// realtime-plan-2026-09-25.md section 1.5 #7's known Unsubscribe
// limitation, which per-connection multiplexed topics must not compound).
func TestMultiplexerCloseReleasesGrantedTopics(t *testing.T) {
	hub := realtime.NewHub(nil)
	tenantID, userID := uuid.New(), uuid.New()
	conn, mux := dialMultiplexed(t, hub, tenantID, userID, []string{"admin"}, nil)

	sendSubscribe(t, conn, "subscribe", "role:admin")
	require.Equal(t, "subscribed", readEnvelope(t, conn, time.Second).Type)
	topic := realtime.TopicRole(tenantID, "admin")
	require.Equal(t, 1, hub.TopicSize(topic))

	mux.Close()
	require.Equal(t, 0, hub.TopicSize(topic))
}

// TestMultiplexerUnsubscribeStopsDelivery proves an explicit client
// unsubscribe request is honored: after it, a publish to that topic no
// longer reaches the connection.
func TestMultiplexerUnsubscribeStopsDelivery(t *testing.T) {
	hub := realtime.NewHub(nil)
	tenantID, userID := uuid.New(), uuid.New()
	conn, _ := dialMultiplexed(t, hub, tenantID, userID, []string{"hr"}, nil)

	sendSubscribe(t, conn, "subscribe", "role:hr")
	require.Equal(t, "subscribed", readEnvelope(t, conn, time.Second).Type)

	sendSubscribe(t, conn, "unsubscribe", "role:hr")
	ack := readEnvelope(t, conn, time.Second)
	require.Equal(t, "unsubscribed", ack.Type)

	require.NoError(t, hub.PublishEvent(realtime.TopicRole(tenantID, "hr"), "staff_attendance.scanned", map[string]string{}))
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(200*time.Millisecond)))
	_, _, err := conn.ReadMessage()
	require.Error(t, err, "must not receive a publish after unsubscribing")
}
