package httpx

import (
	"context"
	"encoding/json"
	"time"
)

// IdempotencyStore is the minimal key-value contract Idempotent needs.
// platform/auth.KVStore (Redis-backed, or the in-memory fallback) already
// satisfies this structurally; httpx does not import platform/auth so a
// lower layer never depends on a sibling platform package for no reason.
type IdempotencyStore interface {
	Get(ctx context.Context, key string) (string, bool, error)
	Set(ctx context.Context, key, value string, ttl time.Duration) error
}

// IdempotencyTTL is how long a client's Idempotency-Key result is
// remembered, per docs/08-security.md section 7: "Idempotency-Key untuk
// POST dari mobile ... disimpan 24 jam di Redis."
const IdempotencyTTL = 24 * time.Hour

// Idempotent runs fn at most once per key: a first call executes fn and
// caches its JSON-encoded result; every later call with the same key
// (before ttl expires) returns the cached result without running fn again.
// The bool return reports whether the result came from cache.
//
// Callers build key from the request's Idempotency-Key header plus enough
// scoping (tenant, user, route) that two different callers can never
// collide on the same header value -- this function does not scope the key
// itself.
func Idempotent[T any](ctx context.Context, store IdempotencyStore, key string, fn func() (T, error)) (T, bool, error) {
	var zero T
	if key == "" || store == nil {
		result, err := fn()
		return result, false, err
	}

	if cached, ok, err := store.Get(ctx, key); err == nil && ok {
		var result T
		if err := json.Unmarshal([]byte(cached), &result); err == nil {
			return result, true, nil
		}
	}

	result, err := fn()
	if err != nil {
		return zero, false, err
	}

	if encoded, err := json.Marshal(result); err == nil {
		_ = store.Set(ctx, key, string(encoded), IdempotencyTTL)
	}
	return result, false, nil
}
