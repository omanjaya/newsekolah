package auth

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// TestSessionCacheKeysArePrefixedByTenant proves the Redis keys this cache
// writes carry the tenant_id prefix docs/08-security.md section 4
// requires ("Kunci cache Redis ... selalu diawali tenant_id"), and that
// the same session id in two different tenants' namespaces never
// collides -- important once session ids stop being assumed globally
// unique across a Redis-level tenant export/delete (offboarding).
func TestSessionCacheKeysArePrefixedByTenant(t *testing.T) {
	store := NewMemoryStore()
	cache := NewSessionCache(store)
	ctx := context.Background()

	tenantA := uuid.New()
	tenantB := uuid.New()
	sessionID := uuid.New()

	require.NoError(t, cache.SetActive(ctx, tenantA, sessionID, true))

	activeA, foundA, err := cache.Get(ctx, tenantA, sessionID)
	require.NoError(t, err)
	require.True(t, foundA)
	require.True(t, activeA)

	// The same session id under a different tenant must not see tenant
	// A's cached value -- it was never written for tenant B.
	_, foundB, err := cache.Get(ctx, tenantB, sessionID)
	require.NoError(t, err)
	require.False(t, foundB, "a session cached under one tenant must not be visible under another")

	// The underlying key literally carries the tenant id.
	_, ok, err := store.Get(ctx, "tenant:"+tenantA.String()+":session:active:"+sessionID.String())
	require.NoError(t, err)
	require.True(t, ok, "SetActive must write a key prefixed tenant:<tenantID>:session:active:<sessionID>")
}

// TestSessionCacheInvalidateIsScopedToTenant proves Invalidate only clears
// the entry for the tenant it was called with, so a caller cannot
// accidentally (or a compromised/other-tenant caller cannot maliciously)
// evict another tenant's cache entry for a colliding session id.
func TestSessionCacheInvalidateIsScopedToTenant(t *testing.T) {
	store := NewMemoryStore()
	cache := NewSessionCache(store)
	ctx := context.Background()

	tenantA := uuid.New()
	tenantB := uuid.New()
	sessionID := uuid.New()

	require.NoError(t, cache.SetActive(ctx, tenantA, sessionID, true))
	require.NoError(t, cache.SetActive(ctx, tenantB, sessionID, true))

	require.NoError(t, cache.Invalidate(ctx, tenantA, sessionID))

	_, foundA, err := cache.Get(ctx, tenantA, sessionID)
	require.NoError(t, err)
	require.False(t, foundA, "Invalidate must evict the entry for the given tenant")

	activeB, foundB, err := cache.Get(ctx, tenantB, sessionID)
	require.NoError(t, err)
	require.True(t, foundB, "Invalidate for tenant A must not evict tenant B's entry")
	require.True(t, activeB)
}

// TestSessionCacheGetNotFound proves an uncached session reports found =
// false rather than a false "active" value, so callers correctly fall
// back to the database instead of trusting a zero value.
func TestSessionCacheGetNotFound(t *testing.T) {
	cache := NewSessionCache(NewMemoryStore())
	ctx := context.Background()

	active, found, err := cache.Get(ctx, uuid.New(), uuid.New())
	require.NoError(t, err)
	require.False(t, found)
	require.False(t, active)
}

// TestSessionCacheShouldTouchLastSeenThrottlesPerTenantSession proves the
// touch throttle marker is also tenant-scoped: it returns true once, then
// false for repeated calls with the same tenant/session pair, but true
// again for the same session id under a different tenant.
func TestSessionCacheShouldTouchLastSeenThrottlesPerTenantSession(t *testing.T) {
	cache := NewSessionCache(NewMemoryStore())
	ctx := context.Background()

	tenantA := uuid.New()
	tenantB := uuid.New()
	sessionID := uuid.New()

	require.True(t, cache.ShouldTouchLastSeen(ctx, tenantA, sessionID), "first check for tenant A must be due")
	require.False(t, cache.ShouldTouchLastSeen(ctx, tenantA, sessionID), "second check within the throttle window must not be due")
	require.True(t, cache.ShouldTouchLastSeen(ctx, tenantB, sessionID), "the same session id under a different tenant must be due independently")
}
