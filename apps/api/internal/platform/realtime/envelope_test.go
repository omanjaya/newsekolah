package realtime_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
)

// TestEnvelopeMarshalUnmarshal proves the wire shape every message a Hub
// topic carries settles on (docs/analysis/realtime-plan-2026-09-25.md
// section 3.1): type, topic, at, and payload all round-trip, and payload
// itself decodes into whatever concrete type the event's Type implies.
func TestEnvelopeMarshalUnmarshal(t *testing.T) {
	type instancePayload struct {
		InstanceID string `json:"instance_id"`
	}
	raw, err := json.Marshal(instancePayload{InstanceID: "abc-123"})
	require.NoError(t, err)

	at := time.Date(2026, 9, 25, 8, 0, 0, 0, time.UTC)
	want := realtime.Envelope{Type: "late_arrival.opened", Topic: "duty:tenant-1:duty_teacher", At: at, Payload: raw}

	wire, err := json.Marshal(want)
	require.NoError(t, err)

	var got realtime.Envelope
	require.NoError(t, json.Unmarshal(wire, &got))

	require.Equal(t, want.Type, got.Type)
	require.Equal(t, want.Topic, got.Topic)
	require.True(t, want.At.Equal(got.At))

	var payload instancePayload
	require.NoError(t, json.Unmarshal(got.Payload, &payload))
	require.Equal(t, "abc-123", payload.InstanceID)
}

// TestEnvelopeWireFieldNames locks down the exact JSON keys clients depend
// on (apps/web/features/notifications/realtime.ts reads "type" and
// "payload" today; chunk D's resync logic will also read "topic" and
// "at") -- a field rename here is a breaking wire change, not a refactor.
func TestEnvelopeWireFieldNames(t *testing.T) {
	raw, err := json.Marshal(realtime.Envelope{
		Type: "monitor.snapshot_changed", Topic: "monitor:tenant-1",
		At: time.Date(2026, 9, 25, 8, 0, 0, 0, time.UTC), Payload: json.RawMessage(`{"session_id":"s1"}`),
	})
	require.NoError(t, err)

	var fields map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(raw, &fields))
	require.Contains(t, fields, "type")
	require.Contains(t, fields, "topic")
	require.Contains(t, fields, "at")
	require.Contains(t, fields, "payload")
}

// TestNewHelloEnvelopeIsFreshEveryTime proves the resync signal plan
// section 3.4 asks for: two hellos for the same topic must carry different
// connection ids, so a client that stores the last id it saw can tell a
// genuinely new connection (reconnect) apart from a message replayed or
// duplicated on the same one.
func TestNewHelloEnvelopeIsFreshEveryTime(t *testing.T) {
	first := realtime.NewHelloEnvelope("user:tenant-1:user-1")
	second := realtime.NewHelloEnvelope("user:tenant-1:user-1")

	var firstEnv, secondEnv realtime.Envelope
	require.NoError(t, json.Unmarshal(first, &firstEnv))
	require.NoError(t, json.Unmarshal(second, &secondEnv))

	require.Equal(t, "hello", firstEnv.Type)
	require.Equal(t, "user:tenant-1:user-1", firstEnv.Topic)

	var firstPayload, secondPayload struct {
		ConnectionID string `json:"connection_id"`
	}
	require.NoError(t, json.Unmarshal(firstEnv.Payload, &firstPayload))
	require.NoError(t, json.Unmarshal(secondEnv.Payload, &secondPayload))
	require.NotEmpty(t, firstPayload.ConnectionID)
	require.NotEqual(t, firstPayload.ConnectionID, secondPayload.ConnectionID)
}
