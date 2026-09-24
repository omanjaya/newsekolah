package realtime_test

import (
	"context"
	"sort"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
)

// TestPresenceSnapshotIncludesRecentHeartbeat proves a key heartbeated
// within ttl of now shows up in Snapshot -- the baseline every other test
// in this file builds on.
func TestPresenceSnapshotIncludesRecentHeartbeat(t *testing.T) {
	presence := realtime.NewPresence(nil, time.Minute)
	now := time.Date(2026, 9, 25, 10, 0, 0, 0, time.UTC)

	presence.Heartbeat(context.Background(), "tenant:teacher:u1", now)

	got := presence.Snapshot(context.Background(), now.Add(30*time.Second))
	assert.Equal(t, []string{"tenant:teacher:u1"}, got)
}

// TestPresenceSnapshotExpiresAfterMissedHeartbeatWindow is the server-side
// expiry regression: a connection that stops heartbeating (crashed,
// network dropped without a clean close, or -- before heartbeatPresence
// existed, cmd/api/ws.go -- simply stayed open longer than ttl past its
// one and only connect-time heartbeat) must fall out of the snapshot once
// ttl has elapsed since its last heartbeat, not linger forever.
func TestPresenceSnapshotExpiresAfterMissedHeartbeatWindow(t *testing.T) {
	presence := realtime.NewPresence(nil, 90*time.Second)
	connectedAt := time.Date(2026, 9, 25, 10, 0, 0, 0, time.UTC)

	presence.Heartbeat(context.Background(), "tenant:teacher:u1", connectedAt)

	// Still within the window: one heartbeat, checked well before ttl.
	got := presence.Snapshot(context.Background(), connectedAt.Add(89*time.Second))
	assert.Equal(t, []string{"tenant:teacher:u1"}, got, "must still be present just under ttl")

	// The missed-heartbeat window has fully elapsed with no further
	// heartbeat: the key must be gone.
	got = presence.Snapshot(context.Background(), connectedAt.Add(91*time.Second))
	assert.Empty(t, got, "must expire once ttl has elapsed since the last heartbeat")
}

// TestPresenceHeartbeatRefreshesTheWindow proves what heartbeatPresence
// (cmd/api/ws.go) relies on: a second heartbeat pushes the expiry window
// forward, so a connection that keeps heartbeating periodically never goes
// stale even though a lone connect-time heartbeat would have expired long
// before.
func TestPresenceHeartbeatRefreshesTheWindow(t *testing.T) {
	presence := realtime.NewPresence(nil, 90*time.Second)
	connectedAt := time.Date(2026, 9, 25, 10, 0, 0, 0, time.UTC)

	presence.Heartbeat(context.Background(), "tenant:teacher:u1", connectedAt)
	// A periodic heartbeat lands well past what the first heartbeat's own
	// ttl would have allowed.
	refreshedAt := connectedAt.Add(80 * time.Second)
	presence.Heartbeat(context.Background(), "tenant:teacher:u1", refreshedAt)

	// 91s after the *first* heartbeat -- past its own ttl -- the key must
	// still be present because the refresh reset the window.
	got := presence.Snapshot(context.Background(), connectedAt.Add(91*time.Second))
	assert.Equal(t, []string{"tenant:teacher:u1"}, got)

	// But ttl past the *refresh*, with still no further heartbeat, it must
	// finally expire.
	got = presence.Snapshot(context.Background(), refreshedAt.Add(91*time.Second))
	assert.Empty(t, got)
}

// TestPresenceRemoveIsImmediate proves a clean disconnect (wsMeHandler's
// onClose callback) drops presence right away, without waiting for ttl --
// distinct from the missed-heartbeat expiry path above.
func TestPresenceRemoveIsImmediate(t *testing.T) {
	presence := realtime.NewPresence(nil, time.Minute)
	now := time.Date(2026, 9, 25, 10, 0, 0, 0, time.UTC)

	presence.Heartbeat(context.Background(), "tenant:teacher:u1", now)
	require.Equal(t, []string{"tenant:teacher:u1"}, presence.Snapshot(context.Background(), now))

	presence.Remove("tenant:teacher:u1")

	assert.Empty(t, presence.Snapshot(context.Background(), now))
}

// TestPresenceSnapshotTracksMultipleKeysIndependently proves one
// connection's missed heartbeat does not affect another's -- each key
// expires on its own schedule.
func TestPresenceSnapshotTracksMultipleKeysIndependently(t *testing.T) {
	presence := realtime.NewPresence(nil, 90*time.Second)
	base := time.Date(2026, 9, 25, 10, 0, 0, 0, time.UTC)

	presence.Heartbeat(context.Background(), "tenant:teacher:stale", base)
	presence.Heartbeat(context.Background(), "tenant:teacher:fresh", base.Add(85*time.Second))

	got := presence.Snapshot(context.Background(), base.Add(91*time.Second))
	sort.Strings(got)
	assert.Equal(t, []string{"tenant:teacher:fresh"}, got, "only the key still within its own ttl window survives")
}

// fakePresenceStore is an in-memory stand-in for realtime.RedisPresenceStore,
// letting TestPresenceSnapshotUsesStoreWhenConfigured exercise the
// multi-replica merge path (Presence.Snapshot prefers the shared store's
// view over its own local map) without a real Redis.
type fakePresenceStore struct {
	entries map[string]time.Time
	err     error
}

func (f *fakePresenceStore) Heartbeat(_ context.Context, key string, _ time.Duration) error {
	if f.entries == nil {
		f.entries = map[string]time.Time{}
	}
	f.entries[key] = time.Now()
	return nil
}

func (f *fakePresenceStore) Snapshot(context.Context) (map[string]time.Time, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.entries, nil
}

// TestPresenceSnapshotUsesStoreWhenConfigured proves that with a store
// configured (multi-replica mode), Snapshot reports the store's own view --
// including a key this local process never heartbeated itself, i.e. one
// another replica's connection is keeping alive -- rather than only this
// process's local map.
func TestPresenceSnapshotUsesStoreWhenConfigured(t *testing.T) {
	store := &fakePresenceStore{entries: map[string]time.Time{
		"tenant:teacher:other-replica": time.Now(),
	}}
	presence := realtime.NewPresence(store, time.Minute)

	got := presence.Snapshot(context.Background(), time.Now())
	assert.Equal(t, []string{"tenant:teacher:other-replica"}, got)
}

// TestPresenceSnapshotFallsBackToLocalWhenStoreErrors proves a Redis
// outage degrades to this process's own local presence map instead of
// reporting nobody online.
func TestPresenceSnapshotFallsBackToLocalWhenStoreErrors(t *testing.T) {
	store := &fakePresenceStore{err: assert.AnError}
	presence := realtime.NewPresence(store, time.Minute)
	now := time.Date(2026, 9, 25, 10, 0, 0, 0, time.UTC)

	presence.Heartbeat(context.Background(), "tenant:teacher:u1", now)

	got := presence.Snapshot(context.Background(), now)
	assert.Equal(t, []string{"tenant:teacher:u1"}, got)
}
