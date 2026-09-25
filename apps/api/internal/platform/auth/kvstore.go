package auth

import (
	"context"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// KVStore is the minimal key-value contract shared by the login rate
// limiter and the session cache. RedisStore backs it in any environment
// with REDIS_URL set; MemoryStore is the single-process fallback so the API
// still boots (per the Phase 0 requirement) when Redis is not configured.
type KVStore interface {
	// Incr increments key and returns the new count. On the first increment
	// (count becomes 1) it also sets the key to expire after ttl.
	Incr(ctx context.Context, key string, ttl time.Duration) (int64, error)
	Get(ctx context.Context, key string) (string, bool, error)
	Set(ctx context.Context, key, value string, ttl time.Duration) error
	Del(ctx context.Context, key string) error
	// SetNX sets key to value and expires it after ttl, but only when key
	// does not already exist; it reports whether this call won that race.
	// httpx.Idempotent uses it as the distributed lock that keeps two
	// concurrent retries of the same Idempotency-Key from both running fn.
	SetNX(ctx context.Context, key, value string, ttl time.Duration) (bool, error)
}

type RedisStore struct {
	client *redis.Client
}

func NewRedisStore(client *redis.Client) *RedisStore {
	return &RedisStore{client: client}
}

func (s *RedisStore) Incr(ctx context.Context, key string, ttl time.Duration) (int64, error) {
	pipe := s.client.TxPipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, ttl)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return incr.Val(), nil
}

func (s *RedisStore) Get(ctx context.Context, key string) (string, bool, error) {
	v, err := s.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

func (s *RedisStore) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	return s.client.Set(ctx, key, value, ttl).Err()
}

func (s *RedisStore) Del(ctx context.Context, key string) error {
	return s.client.Del(ctx, key).Err()
}

func (s *RedisStore) SetNX(ctx context.Context, key, value string, ttl time.Duration) (bool, error) {
	return s.client.SetNX(ctx, key, value, ttl).Result()
}

// MemoryStore is an in-process KVStore for single-instance deployments
// without Redis. It is not shared across API replicas; rate limiting and
// session cache invalidation then only hold within one process.
type MemoryStore struct {
	mu      sync.Mutex
	entries map[string]memEntry
}

type memEntry struct {
	value   string
	count   int64
	expires time.Time
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{entries: make(map[string]memEntry)}
}

func (s *MemoryStore) Incr(_ context.Context, key string, ttl time.Duration) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := (clock.Real{}).Now()
	e, ok := s.entries[key]
	if !ok || now.After(e.expires) {
		e = memEntry{count: 0, expires: now.Add(ttl)}
	}
	e.count++
	// Mirror Redis, where INCR leaves the counter readable through GET.
	e.value = strconv.FormatInt(e.count, 10)
	s.entries[key] = e
	return e.count, nil
}

func (s *MemoryStore) Get(_ context.Context, key string) (string, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	e, ok := s.entries[key]
	if !ok || (clock.Real{}).Now().After(e.expires) {
		delete(s.entries, key)
		return "", false, nil
	}
	return e.value, true, nil
}

func (s *MemoryStore) Set(_ context.Context, key, value string, ttl time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.entries[key] = memEntry{value: value, expires: (clock.Real{}).Now().Add(ttl)}
	return nil
}

func (s *MemoryStore) Del(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.entries, key)
	return nil
}

func (s *MemoryStore) SetNX(_ context.Context, key, value string, ttl time.Duration) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := (clock.Real{}).Now()
	if e, ok := s.entries[key]; ok && now.Before(e.expires) {
		return false, nil
	}
	s.entries[key] = memEntry{value: value, expires: now.Add(ttl)}
	return true, nil
}
