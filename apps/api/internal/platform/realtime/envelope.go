package realtime

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Envelope is the one wire shape every message a Hub topic ever carries
// uses -- server broadcasts and a single connection's direct acks alike:
// {type, topic, at, payload}. Before this, call sites shaped their own
// JSON ad hoc: {type, payload} for notification_created, {type, ...flat
// fields} for classroom_entry_scanned, and no type field at all for
// attendance's MonitorUpdate (docs/analysis/realtime-plan-2026-09-25.md
// section 1.5 #1). Payload only ever carries ids, never the record itself
// -- the client always re-fetches the detail through its already-
// authorized REST endpoint (plan section 2); this package does not enforce
// that convention, it only gives every call site one place to follow it.
type Envelope struct {
	Type  string    `json:"type"`
	Topic string    `json:"topic"`
	At    time.Time `json:"at"`
	// Payload is a raw JSON value rather than `any` so Envelope can be
	// unmarshaled once (to read Type/Topic/At) before the caller decodes
	// Payload into whatever shape that Type implies, without a second
	// round trip through the wire bytes.
	Payload json.RawMessage `json:"payload,omitempty"`
}

// newEnvelope marshals payload and wraps it in an Envelope, ready to send:
// used by both Hub.PublishEvent (a broadcast to every subscriber of topic,
// hub.go) and Multiplexer's direct, single-connection acks (subscribe.go)
// and NewHelloEnvelope below, so all three share one marshal path instead
// of each shaping the wire bytes themselves.
func newEnvelope(topic, eventType string, payload any) ([]byte, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return json.Marshal(Envelope{Type: eventType, Topic: topic, At: time.Now().UTC(), Payload: raw})
}

// NewHelloEnvelope is the first message /ws/me sends right after a
// successful upgrade (see cmd/api/ws.go's wire-contract doc comment for
// the full message catalogue). Its connection_id is fresh on every
// (re)connect, so a client can tell a brand new connection apart from one
// it has already resynced against and knows to treat anything it inferred
// about server state before as stale (plan section 3.4).
func NewHelloEnvelope(topic string) []byte {
	raw, err := newEnvelope(topic, "hello", struct {
		ConnectionID string `json:"connection_id"`
	}{ConnectionID: uuid.NewString()})
	if err != nil {
		// Marshaling a fixed one-field struct of strings cannot fail in
		// practice; if it somehow did, a bare hello is safer for the
		// upgrade goroutine than propagating an error nothing calls this
		// for a return value would check.
		return []byte(`{"type":"hello"}`)
	}
	return raw
}
