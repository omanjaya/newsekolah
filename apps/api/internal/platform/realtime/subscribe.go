package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"

	"github.com/google/uuid"
)

// DutyLookup answers "who holds this duty right now" in tenantID's active
// academic year, optionally scoped to one class. It is the same question
// internal/wiring.DutyLookup answers for the notification bridge --
// redeclared here (rather than imported) so this platform package never
// depends on internal/wiring, which in turn depends on every module it
// bridges; identity/service.Service satisfies both interfaces with the
// same method, and cmd/api wires that one implementation into each.
type DutyLookup interface {
	UsersWithDuty(ctx context.Context, tenantID uuid.UUID, slug string, classID uuid.NullUUID) ([]uuid.UUID, error)
}

// Client -> server actions accepted by Multiplexer.HandleMessage. See
// cmd/api/ws.go's package doc comment for the full wire contract.
const (
	actionSubscribe   = "subscribe"
	actionUnsubscribe = "unsubscribe"
)

// Short topic categories a client may request. A client never sends a
// tenant-qualified topic (that would let it try another tenant's); it
// sends one of these, and Multiplexer resolves it under its own
// connection's tenant.
const (
	categoryUser = "user"
	categoryRole = "role"
	categoryDuty = "duty"
)

// subscribeMessage is the client -> server frame /ws/me accepts after the
// handshake: {"action":"subscribe","topics":["role:admin","duty:homeroom:<classID>"]}.
type subscribeMessage struct {
	Action string   `json:"action"`
	Topics []string `json:"topics"`
}

// grantedDuty remembers which duty a granted topic was authorized against,
// so Multiplexer.RecheckDuties can ask DutyLookup the same question again
// later and release the ones that no longer hold.
type grantedDuty struct {
	slug    string
	classID uuid.NullUUID
}

// Multiplexer owns one /ws/me connection's dynamic topic subscriptions
// beyond its base user topic (which cmd/api/ws.go still subscribes at
// Upgrade time, unchanged, for backward compatibility with clients that
// never send a subscribe message at all): authorizing each client-
// requested topic against the token's claims (role) or a live DutyLookup
// call (duty), tracking what was granted so it can be released on
// disconnect or the moment a periodic recheck finds a duty gone, and
// always resolving topics under the connection's own tenant -- a client
// can never name another tenant's topic, because the short wire form never
// carries a tenant at all (docs/analysis/realtime-plan-2026-09-25.md
// section 3.2).
type Multiplexer struct {
	hub      *Hub
	client   *Client
	tenantID uuid.UUID
	userID   uuid.UUID
	roles    map[string]struct{}
	duties   DutyLookup
	logger   *slog.Logger

	mu         sync.Mutex
	dutyTopics map[string]grantedDuty // full topic -> what was checked
	allTopics  map[string]struct{}    // every topic granted via this Multiplexer, for Close
}

// NewMultiplexer builds a Multiplexer for one already-upgraded client.
// roles should be the access token's claims.Roles; duties may be nil (no
// duty topic will ever be granted, matching internal/wiring's own "nil
// DutyLookup" fallback).
func NewMultiplexer(hub *Hub, client *Client, tenantID, userID uuid.UUID, roles []string, duties DutyLookup, logger *slog.Logger) *Multiplexer {
	roleSet := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		roleSet[r] = struct{}{}
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Multiplexer{
		hub: hub, client: client, tenantID: tenantID, userID: userID,
		roles: roleSet, duties: duties, logger: logger,
		dutyTopics: make(map[string]grantedDuty),
		allTopics:  make(map[string]struct{}),
	}
}

// HandleMessage parses one inbound frame and applies it. Malformed JSON or
// an unrecognized action is dropped silently: the client never sends
// anything else today, and there is no separate error channel to report it
// on -- readPump (client.go) already treats an unparseable frame the same
// way.
func (m *Multiplexer) HandleMessage(raw []byte) {
	var msg subscribeMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}
	ctx := context.Background()
	switch msg.Action {
	case actionSubscribe:
		for _, short := range msg.Topics {
			m.subscribe(ctx, short)
		}
	case actionUnsubscribe:
		for _, short := range msg.Topics {
			m.unsubscribe(short)
		}
	}
}

func (m *Multiplexer) subscribe(ctx context.Context, short string) {
	decision := m.authorize(ctx, short)
	if !decision.ok {
		m.ack("subscribe_rejected", short, map[string]string{"reason": decision.reason})
		return
	}

	m.hub.Subscribe(decision.topic, m.client)
	m.mu.Lock()
	m.allTopics[decision.topic] = struct{}{}
	if decision.dutySlug != "" {
		m.dutyTopics[decision.topic] = grantedDuty{slug: decision.dutySlug, classID: decision.dutyClass}
	}
	m.mu.Unlock()
	m.ack("subscribed", decision.topic, struct{}{})
}

func (m *Multiplexer) unsubscribe(short string) {
	category, ident, classID, ok := parseTopic(short)
	if !ok {
		return
	}
	topic := m.resolveTopicName(category, ident, classID)
	if topic == "" {
		return
	}

	m.hub.Unsubscribe(topic, m.client)
	m.mu.Lock()
	delete(m.allTopics, topic)
	delete(m.dutyTopics, topic)
	m.mu.Unlock()
	m.ack("unsubscribed", topic, struct{}{})
}

// RecheckDuties re-verifies every duty topic this connection currently
// holds and releases any DutyLookup no longer confirms -- e.g. a duty
// piket teacher's shift ended mid-connection (plan section 3.2). Call it
// periodically from its own goroutine for the life of the connection;
// cmd/api/ws.go's watchDutySubscriptions mirrors watchSessionValidity's
// ticker for this.
func (m *Multiplexer) RecheckDuties(ctx context.Context) {
	m.mu.Lock()
	held := make(map[string]grantedDuty, len(m.dutyTopics))
	for topic, g := range m.dutyTopics {
		held[topic] = g
	}
	m.mu.Unlock()

	for topic, g := range held {
		if m.holdsDuty(ctx, g.slug, g.classID) {
			continue
		}
		m.hub.Unsubscribe(topic, m.client)
		m.mu.Lock()
		delete(m.allTopics, topic)
		delete(m.dutyTopics, topic)
		m.mu.Unlock()
		m.ack("unsubscribed", topic, map[string]string{"reason": "duty_no_longer_held"})
	}
}

// Close releases every topic this Multiplexer ever granted. It does not
// touch the connection's base user topic: cmd/api/ws.go subscribes that
// one directly at Upgrade time and its own onClose callback (built into
// Upgrade) already unsubscribes it.
func (m *Multiplexer) Close() {
	m.mu.Lock()
	topics := make([]string, 0, len(m.allTopics))
	for topic := range m.allTopics {
		topics = append(topics, topic)
	}
	m.mu.Unlock()

	for _, topic := range topics {
		m.hub.Unsubscribe(topic, m.client)
	}
}

// authDecision is authorize's result: either ok and topic is the fully
// tenant-scoped topic to subscribe to (with dutySlug/dutyClass set when it
// came from a duty check, so subscribe() knows to track it for
// RecheckDuties), or not ok and reason explains why, for the
// "subscribe_rejected" ack.
type authDecision struct {
	topic     string
	dutySlug  string
	dutyClass uuid.NullUUID
	ok        bool
	reason    string
}

// authorize decides whether this connection may subscribe to the client-
// requested short topic, and resolves it to a fully tenant-scoped topic
// name if so. It never trusts a tenant id from the client -- there is none
// in the short form to trust -- always resolving under m.tenantID, which
// is exactly how a request to subscribe under a different tenant's data is
// refused: it is simply not a request this method can express, not a check
// that could be bypassed.
func (m *Multiplexer) authorize(ctx context.Context, short string) authDecision {
	category, ident, classID, ok := parseTopic(short)
	if !ok {
		return authDecision{reason: "unrecognized_topic"}
	}
	switch category {
	case categoryUser:
		id, err := uuid.Parse(ident)
		if err != nil || id != m.userID {
			return authDecision{reason: "not_self"}
		}
		return authDecision{topic: TopicUser(m.tenantID, id), ok: true}
	case categoryRole:
		if _, held := m.roles[ident]; !held {
			return authDecision{reason: "role_not_held"}
		}
		return authDecision{topic: TopicRole(m.tenantID, ident), ok: true}
	case categoryDuty:
		if !m.holdsDuty(ctx, ident, classID) {
			return authDecision{reason: "duty_not_held"}
		}
		return authDecision{topic: TopicDuty(m.tenantID, ident, classID), dutySlug: ident, dutyClass: classID, ok: true}
	default:
		return authDecision{reason: "unrecognized_topic"}
	}
}

// resolveTopicName mirrors authorize's topic-name resolution without the
// permission check, for unsubscribe (releasing a topic you were never
// granted is a harmless no-op on Hub, so it needs no authorization -- only
// a way to compute the same full name subscribe would have used).
func (m *Multiplexer) resolveTopicName(category, ident string, classID uuid.NullUUID) string {
	switch category {
	case categoryUser:
		id, err := uuid.Parse(ident)
		if err != nil {
			return ""
		}
		return TopicUser(m.tenantID, id)
	case categoryRole:
		return TopicRole(m.tenantID, ident)
	case categoryDuty:
		return TopicDuty(m.tenantID, ident, classID)
	default:
		return ""
	}
}

func (m *Multiplexer) holdsDuty(ctx context.Context, slug string, classID uuid.NullUUID) bool {
	if m.duties == nil {
		return false
	}
	holders, err := m.duties.UsersWithDuty(ctx, m.tenantID, slug, classID)
	if err != nil {
		m.logger.Warn("realtime: duty lookup failed", "slug", slug, "error", err)
		return false
	}
	for _, id := range holders {
		if id == m.userID {
			return true
		}
	}
	return false
}

// ack sends a direct, single-connection Envelope back over m.client --
// never through the Hub, since this is a reply to one subscribe request,
// not a broadcast.
func (m *Multiplexer) ack(eventType, topic string, payload any) {
	raw, err := newEnvelope(topic, eventType, payload)
	if err != nil {
		return
	}
	m.client.Send(raw)
}

// parseTopic splits a client-supplied short topic into its category and
// identifier. This is the only place client input decides the *shape* of a
// subscription request; every other property -- which tenant, whether the
// caller actually may have it -- comes from server-held state afterward
// (Multiplexer.authorize), never from the string itself.
func parseTopic(short string) (category, ident string, classID uuid.NullUUID, ok bool) {
	switch {
	case strings.HasPrefix(short, categoryUser+":"):
		return categoryUser, strings.TrimPrefix(short, categoryUser+":"), uuid.NullUUID{}, true
	case strings.HasPrefix(short, categoryRole+":"):
		return categoryRole, strings.TrimPrefix(short, categoryRole+":"), uuid.NullUUID{}, true
	case strings.HasPrefix(short, categoryDuty+":"):
		rest := strings.TrimPrefix(short, categoryDuty+":")
		slug, class, hasClass := strings.Cut(rest, ":")
		if !hasClass {
			return categoryDuty, slug, uuid.NullUUID{}, true
		}
		id, err := uuid.Parse(class)
		if err != nil {
			return "", "", uuid.NullUUID{}, false
		}
		return categoryDuty, slug, uuid.NullUUID{UUID: id, Valid: true}, true
	default:
		return "", "", uuid.NullUUID{}, false
	}
}
