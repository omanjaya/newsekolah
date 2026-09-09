package realtime

import (
	"context"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisBroadcaster fans Hub.Publish calls out to every API replica over
// Redis pub-sub, per docs/02-system-design.md section 4.7. Channel names
// are prefixed so realtime traffic never collides with other Redis key
// spaces (session cache, rate limiter).
type RedisBroadcaster struct {
	client *redis.Client
	prefix string
}

func NewRedisBroadcaster(client *redis.Client) *RedisBroadcaster {
	return &RedisBroadcaster{client: client, prefix: "realtime:"}
}

func (b *RedisBroadcaster) Publish(ctx context.Context, topic string, payload []byte) error {
	return b.client.Publish(ctx, b.prefix+topic, payload).Err()
}

func (b *RedisBroadcaster) Subscribe(ctx context.Context, topic string, handle func(payload []byte)) {
	sub := b.client.Subscribe(ctx, b.prefix+topic)
	defer func() { _ = sub.Close() }()

	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			handle([]byte(msg.Payload))
		}
	}
}

// RedisPresenceStore shares "who has a socket open" across replicas using a
// sorted set keyed by last-heartbeat unix time, so Snapshot can filter by
// age without a separate expiry sweep.
type RedisPresenceStore struct {
	client *redis.Client
	key    string
}

func NewRedisPresenceStore(client *redis.Client, key string) *RedisPresenceStore {
	return &RedisPresenceStore{client: client, key: key}
}

func (s *RedisPresenceStore) Heartbeat(ctx context.Context, key string, ttl time.Duration) error {
	now := float64(time.Now().Unix())
	if err := s.client.ZAdd(ctx, s.key, redis.Z{Score: now, Member: key}).Err(); err != nil {
		return err
	}
	// Trim entries older than ttl on every heartbeat so the set does not
	// grow unbounded with users who disconnected without a clean close.
	cutoff := float64(time.Now().Add(-ttl).Unix())
	return s.client.ZRemRangeByScore(ctx, s.key, "-inf", strconv.FormatFloat(cutoff, 'f', 0, 64)).Err()
}

func (s *RedisPresenceStore) Snapshot(ctx context.Context) (map[string]time.Time, error) {
	entries, err := s.client.ZRangeWithScores(ctx, s.key, 0, -1).Result()
	if err != nil {
		return nil, err
	}
	out := make(map[string]time.Time, len(entries))
	for _, e := range entries {
		if member, ok := e.Member.(string); ok {
			out[member] = time.Unix(int64(e.Score), 0)
		}
	}
	return out, nil
}
