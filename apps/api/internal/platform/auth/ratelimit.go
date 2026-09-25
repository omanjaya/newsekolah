package auth

import (
	"context"
	"fmt"
	"strconv"
	"time"
)

// LoginRateLimiter enforces docs/08-security.md section 2 against failed
// logins only: 5 failures per 15 minutes per account, and a much higher
// per-IP ceiling. Successful logins are never counted, because a whole
// school signs in from one NAT address at the start of a lesson; counting
// every attempt per IP locked a class out after the twentieth student.
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
		perIPLimit:      100,
	}
}

// Allow reports whether another attempt is allowed without counting it.
func (l *LoginRateLimiter) Allow(ctx context.Context, tenantID, username, ip string) (bool, error) {
	accountCount, err := l.count(ctx, l.accountKey(tenantID, username))
	if err != nil {
		return false, fmt.Errorf("rate limit account counter: %w", err)
	}
	ipCount, err := l.count(ctx, l.ipKey(ip))
	if err != nil {
		return false, fmt.Errorf("rate limit ip counter: %w", err)
	}
	return accountCount < l.perAccountLimit && ipCount < l.perIPLimit, nil
}

// RecordFailure counts one failed attempt against both the account and the
// IP. The window starts at the first failure and is not extended by later
// ones.
func (l *LoginRateLimiter) RecordFailure(ctx context.Context, tenantID, username, ip string) error {
	if _, err := l.store.Incr(ctx, l.accountKey(tenantID, username), l.window); err != nil {
		return fmt.Errorf("rate limit account counter: %w", err)
	}
	if _, err := l.store.Incr(ctx, l.ipKey(ip), l.window); err != nil {
		return fmt.Errorf("rate limit ip counter: %w", err)
	}
	return nil
}

func (l *LoginRateLimiter) accountKey(tenantID, username string) string {
	return fmt.Sprintf("login:account:%s:%s", tenantID, username)
}

func (l *LoginRateLimiter) ipKey(ip string) string {
	return fmt.Sprintf("login:ip:%s", ip)
}

func (l *LoginRateLimiter) count(ctx context.Context, key string) (int64, error) {
	raw, ok, err := l.store.Get(ctx, key)
	if err != nil || !ok {
		return 0, err
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse counter %s: %w", key, err)
	}
	return n, nil
}
