package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// APIKeyRateLimiter enforces a per-key requests-per-minute ceiling, reusing
// the same KVStore-backed fixed-window counter as LoginRateLimiter instead of
// adding a second rate-limiting mechanism (docs/12-roadmap.md Fase 5).
type APIKeyRateLimiter struct {
	store  KVStore
	window time.Duration
}

func NewAPIKeyRateLimiter(store KVStore) *APIKeyRateLimiter {
	return &APIKeyRateLimiter{store: store, window: time.Minute}
}

// Allow increments the key's counter for the current window and reports
// whether it is still within limitPerMinute. A client that keeps calling
// past the limit is refused until the window that started with its first
// call rolls over; the refused calls do not extend it.
func (l *APIKeyRateLimiter) Allow(ctx context.Context, keyID uuid.UUID, limitPerMinute int64) (bool, error) {
	key := fmt.Sprintf("apikey:rate:%s", keyID)
	count, err := l.store.Incr(ctx, key, l.window)
	if err != nil {
		return false, fmt.Errorf("api key rate limit counter: %w", err)
	}
	return count <= limitPerMinute, nil
}
