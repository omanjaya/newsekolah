package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

const sessionCacheTTL = 60 * time.Second

// SessionCache remembers whether a session was active the last time it was
// checked against the database, so the authn middleware does not hit the
// database on every request. Revoking a session (logout, password change,
// reuse detection) must call Invalidate so the change takes effect
// immediately instead of waiting out the cache TTL.
type SessionCache struct {
	store KVStore
}

func NewSessionCache(store KVStore) *SessionCache {
	return &SessionCache{store: store}
}

func sessionCacheKey(sessionID uuid.UUID) string {
	return fmt.Sprintf("session:active:%s", sessionID)
}

// Get returns (active, found). found is false when nothing is cached and
// the caller must fall back to the database.
func (c *SessionCache) Get(ctx context.Context, sessionID uuid.UUID) (active bool, found bool, err error) {
	v, ok, err := c.store.Get(ctx, sessionCacheKey(sessionID))
	if err != nil || !ok {
		return false, false, err
	}
	return v == "1", true, nil
}

func (c *SessionCache) SetActive(ctx context.Context, sessionID uuid.UUID, active bool) error {
	v := "0"
	if active {
		v = "1"
	}
	return c.store.Set(ctx, sessionCacheKey(sessionID), v, sessionCacheTTL)
}

func (c *SessionCache) Invalidate(ctx context.Context, sessionID uuid.UUID) error {
	return c.store.Del(ctx, sessionCacheKey(sessionID))
}
