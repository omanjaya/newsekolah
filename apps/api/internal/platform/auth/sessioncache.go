package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

const sessionCacheTTL = 60 * time.Second

// touchThrottle is how often the middleware is allowed to update a
// session's last_seen_at (docs/analysis/backend-inventory.md section
// 1.1): frequent enough for "list my sessions" to read as current, rare
// enough not to write on every single request.
const touchThrottle = 5 * time.Minute

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

// sessionCacheKey is prefixed with tenantID per docs/08-security.md
// section 4 ("Kunci cache Redis ... selalu diawali tenant_id"). session
// IDs are already globally unique (uuid), so the prefix is not needed to
// avoid collisions -- it exists so a Redis-level audit or a tenant data
// export/delete (offboarding) can find every key belonging to one tenant
// by prefix, same as the S3 object key convention (tenants/<id>/...).
func sessionCacheKey(tenantID, sessionID uuid.UUID) string {
	return fmt.Sprintf("tenant:%s:session:active:%s", tenantID, sessionID)
}

// Get returns (active, found). found is false when nothing is cached and
// the caller must fall back to the database.
func (c *SessionCache) Get(ctx context.Context, tenantID, sessionID uuid.UUID) (active bool, found bool, err error) {
	v, ok, err := c.store.Get(ctx, sessionCacheKey(tenantID, sessionID))
	if err != nil || !ok {
		return false, false, err
	}
	return v == "1", true, nil
}

func (c *SessionCache) SetActive(ctx context.Context, tenantID, sessionID uuid.UUID, active bool) error {
	v := "0"
	if active {
		v = "1"
	}
	return c.store.Set(ctx, sessionCacheKey(tenantID, sessionID), v, sessionCacheTTL)
}

func (c *SessionCache) Invalidate(ctx context.Context, tenantID, sessionID uuid.UUID) error {
	return c.store.Del(ctx, sessionCacheKey(tenantID, sessionID))
}

func touchCacheKey(tenantID, sessionID uuid.UUID) string {
	return fmt.Sprintf("tenant:%s:session:touch:%s", tenantID, sessionID)
}

// ShouldTouchLastSeen reports whether the caller is due to update
// sessionID's last_seen_at now. It self-throttles to once per
// touchThrottle by marking the key it just checked, so the check works the
// same way across every API replica (the marker lives in the shared
// KVStore, not in process memory).
func (c *SessionCache) ShouldTouchLastSeen(ctx context.Context, tenantID, sessionID uuid.UUID) bool {
	_, found, err := c.store.Get(ctx, touchCacheKey(tenantID, sessionID))
	if err != nil || found {
		return false
	}
	_ = c.store.Set(ctx, touchCacheKey(tenantID, sessionID), "1", touchThrottle)
	return true
}
