package auth

import (
	"context"
	"fmt"
	"time"
)

// IPRateLimiter is a single-counter-per-IP limiter for endpoints that are
// not the login form itself (LoginRateLimiter also tracks a per-account
// counter and has its own fixed thresholds). The password reset request
// endpoint uses this to bound how many reset emails one IP can trigger.
type IPRateLimiter struct {
	store  KVStore
	prefix string
	window time.Duration
	limit  int64
}

func NewIPRateLimiter(store KVStore, prefix string, limit int64, window time.Duration) *IPRateLimiter {
	return &IPRateLimiter{store: store, prefix: prefix, limit: limit, window: window}
}

// Allow increments the counter for ip and reports whether it is still
// within the limit. It always increments, even past the limit, so repeated
// attempts keep extending the block window.
func (l *IPRateLimiter) Allow(ctx context.Context, ip string) (bool, error) {
	count, err := l.store.Incr(ctx, fmt.Sprintf("%s:%s", l.prefix, ip), l.window)
	if err != nil {
		return false, fmt.Errorf("rate limit %s counter: %w", l.prefix, err)
	}
	return count <= l.limit, nil
}
