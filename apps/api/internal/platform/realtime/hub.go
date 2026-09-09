// Package realtime implements the WebSocket hub shared by every module that
// needs to push events to a connected browser or app: per-user sockets
// (notifications, workflow results) and per-topic sockets (a monitor
// screen). It is intentionally free of any module or gen/api dependency --
// callers supply their own auth check and topic naming; this package only
// owns the connection lifecycle (upgrade, ping/pong, read limits) and
// fan-out (local, or via Redis pub-sub when running more than one API
// replica).
package realtime

import (
	"context"
	"encoding/json"
	"sync"
	"time"
)

// Hub tracks every live WebSocket connection, grouped by topic. A topic is
// just a string the caller defines (e.g. "monitor:<tenantID>",
// "user:<tenantID>:<userID>"); the hub does not interpret it.
type Hub struct {
	mu     sync.RWMutex
	topics map[string]map[*Client]struct{}

	broadcaster Broadcaster
}

// Broadcaster fans a published message out to every other API replica.
// RedisBroadcaster implements this over Redis pub-sub; a nil Broadcaster
// means single-instance mode, where Publish only reaches local clients.
type Broadcaster interface {
	Publish(ctx context.Context, topic string, payload []byte) error
	// Subscribe delivers every message published to topic (by any replica,
	// including this one) to handle, until ctx is cancelled.
	Subscribe(ctx context.Context, topic string, handle func(payload []byte))
}

// NewHub builds a Hub. Pass a nil Broadcaster for single-instance
// deployments (REDIS_URL unset): Publish then only reaches clients
// connected to this process.
func NewHub(broadcaster Broadcaster) *Hub {
	return &Hub{
		topics:      make(map[string]map[*Client]struct{}),
		broadcaster: broadcaster,
	}
}

// Subscribe registers client under topic. It also opens the topic's Redis
// subscription on first use when a Broadcaster is configured, so a message
// published from any replica reaches this process's clients on that topic.
func (h *Hub) Subscribe(topic string, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	set, ok := h.topics[topic]
	if !ok {
		set = make(map[*Client]struct{})
		h.topics[topic] = set
		h.watchRemote(topic)
	}
	set[client] = struct{}{}
}

// Unsubscribe removes client from topic. It never closes the underlying
// Redis subscription: that stays open for the process lifetime once opened,
// which is simpler than reference-counting it and costs one idle
// subscription per topic name ever seen.
func (h *Hub) Unsubscribe(topic string, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if set, ok := h.topics[topic]; ok {
		delete(set, client)
		if len(set) == 0 {
			delete(h.topics, topic)
		}
	}
}

// watchRemote starts a background subscription that re-delivers messages
// published by other replicas to this process's local clients. Must be
// called with h.mu held. A nil broadcaster (single-instance mode) is a
// no-op: Publish already reaches local clients directly.
func (h *Hub) watchRemote(topic string) {
	if h.broadcaster == nil {
		return
	}
	ctx := context.Background()
	go h.broadcaster.Subscribe(ctx, topic, func(payload []byte) {
		h.deliverLocal(topic, payload)
	})
}

// Publish sends payload (marshaled as JSON) to every client subscribed to
// topic on this process, and -- when a Broadcaster is configured -- to
// every other replica's clients on that topic too.
func (h *Hub) Publish(topic string, event any) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	h.deliverLocal(topic, payload)

	if h.broadcaster != nil {
		return h.broadcaster.Publish(context.Background(), topic, payload)
	}
	return nil
}

func (h *Hub) deliverLocal(topic string, payload []byte) {
	h.mu.RLock()
	clients := make([]*Client, 0, len(h.topics[topic]))
	for c := range h.topics[topic] {
		clients = append(clients, c)
	}
	h.mu.RUnlock()

	for _, c := range clients {
		c.send(payload)
	}
}

// TopicSize reports how many local clients are subscribed to topic, mainly
// for tests and presence counts.
func (h *Hub) TopicSize(topic string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.topics[topic])
}

// PresenceHeartbeat and PresenceSnapshot back GET /v1/monitor/presence: an
// in-memory (and, when store is set, Redis-shared) map of "who has a socket
// open right now", keyed by an arbitrary caller-defined key (role, or
// user ID). It is deliberately separate from the topic registry above --
// presence is a business concept (attendance module's monitor), sockets are
// plumbing.
type Presence struct {
	mu    sync.Mutex
	seen  map[string]time.Time
	store PresenceStore
	ttl   time.Duration
}

// PresenceStore shares heartbeats across replicas via Redis. A nil store
// keeps presence in-memory only (single replica).
type PresenceStore interface {
	Heartbeat(ctx context.Context, key string, ttl time.Duration) error
	Snapshot(ctx context.Context) (map[string]time.Time, error)
}

func NewPresence(store PresenceStore, ttl time.Duration) *Presence {
	return &Presence{seen: make(map[string]time.Time), store: store, ttl: ttl}
}

func (p *Presence) Heartbeat(ctx context.Context, key string, now time.Time) {
	p.mu.Lock()
	p.seen[key] = now
	p.mu.Unlock()

	if p.store != nil {
		_ = p.store.Heartbeat(ctx, key, p.ttl)
	}
}

func (p *Presence) Remove(key string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.seen, key)
}

// Snapshot returns every key seen within ttl of now. In multi-replica mode
// (store configured) it merges the shared Redis view; otherwise it is this
// process's own view only.
func (p *Presence) Snapshot(ctx context.Context, now time.Time) []string {
	if p.store != nil {
		if remote, err := p.store.Snapshot(ctx); err == nil {
			out := make([]string, 0, len(remote))
			for k := range remote {
				out = append(out, k)
			}
			return out
		}
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]string, 0, len(p.seen))
	for k, at := range p.seen {
		if now.Sub(at) <= p.ttl {
			out = append(out, k)
		}
	}
	return out
}
