package auth

import (
	"context"
	"fmt"
	"time"
)

// LoginRateLimiter enforces docs/08-security.md section 2: 5 attempts per
// 15 minutes per account, 20 per 15 minutes per IP.
type LoginRateLimiter struct {
	store  KVStore
	window time.Duration

	perAccountLimit int64
	perIPLimit      int64
}

func NewLoginRateLimiter(store KVStore) *LoginRateLimiter {
	return &LoginRateLimiter{
		store:           store,
		window:          15 * time.Minute,
		perAccountLimit: 5,
		perIPLimit:      20,
	}
}

// Allow increments both counters and reports whether the attempt is allowed.
// It always increments even when it will return false, so repeated
// hammering keeps extending the block window.
func (l *LoginRateLimiter) Allow(ctx context.Context, tenantID, username, ip string) (bool, error) {
	accountKey := fmt.Sprintf("login:account:%s:%s", tenantID, username)
	ipKey := fmt.Sprintf("login:ip:%s", ip)

	accountCount, err := l.store.Incr(ctx, accountKey, l.window)
	if err != nil {
		return false, fmt.Errorf("rate limit account counter: %w", err)
	}
	ipCount, err := l.store.Incr(ctx, ipKey, l.window)
	if err != nil {
		return false, fmt.Errorf("rate limit ip counter: %w", err)
	}

	return accountCount <= l.perAccountLimit && ipCount <= l.perIPLimit, nil
}
