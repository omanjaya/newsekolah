package wiring

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type movableClock struct {
	mu sync.Mutex
	at time.Time
}

func (c *movableClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.at
}

func (c *movableClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.at = c.at.Add(d)
}

type countingStore struct {
	mu    sync.Mutex
	flags map[string]bool
	err   error
	loads int
}

func (s *countingStore) StoredFlags(context.Context, uuid.UUID) (map[string]bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loads++
	if s.err != nil {
		return nil, s.err
	}
	out := make(map[string]bool, len(s.flags))
	for k, v := range s.flags {
		out[k] = v
	}
	return out, nil
}

func (s *countingStore) set(module string, enabled bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.flags[module] = enabled
}

func (s *countingStore) loadCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loads
}

func newCache(t *testing.T) (*CachedFlags, *countingStore, *movableClock) {
	t.Helper()
	store := &countingStore{flags: map[string]bool{}}
	clk := &movableClock{at: time.Date(2026, 1, 1, 8, 0, 0, 0, time.UTC)}
	return NewCachedFlags(store, clk, 15*time.Second), store, clk
}

func TestCachedFlagsDefaultsToEnabledAndCachesWithinTTL(t *testing.T) {
	cache, store, clk := newCache(t)
	tenantID := uuid.New()
	ctx := context.Background()

	enabled, err := cache.IsModuleEnabled(ctx, tenantID, "library")
	require.NoError(t, err)
	require.True(t, enabled, "a module with no row is enabled")

	store.set("library", false)
	clk.advance(14 * time.Second)
	enabled, err = cache.IsModuleEnabled(ctx, tenantID, "library")
	require.NoError(t, err)
	require.True(t, enabled, "a change inside the TTL is not visible yet")
	require.Equal(t, 1, store.loadCount())
}

func TestCachedFlagsReloadsAfterTTL(t *testing.T) {
	cache, store, clk := newCache(t)
	tenantID := uuid.New()
	ctx := context.Background()

	_, err := cache.IsModuleEnabled(ctx, tenantID, "library")
	require.NoError(t, err)

	store.set("library", false)
	clk.advance(15 * time.Second)
	enabled, err := cache.IsModuleEnabled(ctx, tenantID, "library")
	require.NoError(t, err)
	require.False(t, enabled)
	require.Equal(t, 2, store.loadCount())
}

func TestCachedFlagsInvalidateIsImmediateAndPerTenant(t *testing.T) {
	cache, store, _ := newCache(t)
	tenantA, tenantB := uuid.New(), uuid.New()
	ctx := context.Background()

	_, err := cache.IsModuleEnabled(ctx, tenantA, "library")
	require.NoError(t, err)
	_, err = cache.IsModuleEnabled(ctx, tenantB, "library")
	require.NoError(t, err)
	require.Equal(t, 2, store.loadCount())

	store.set("library", false)
	cache.Invalidate(tenantA)

	enabled, err := cache.IsModuleEnabled(ctx, tenantA, "library")
	require.NoError(t, err)
	require.False(t, enabled)

	enabled, err = cache.IsModuleEnabled(ctx, tenantB, "library")
	require.NoError(t, err)
	require.True(t, enabled, "tenant B still serves its cached entry")
	require.Equal(t, 3, store.loadCount())
}

func TestCachedFlagsDoesNotCacheErrors(t *testing.T) {
	cache, store, _ := newCache(t)
	tenantID := uuid.New()
	ctx := context.Background()

	store.err = errors.New("db down")
	_, err := cache.IsModuleEnabled(ctx, tenantID, "library")
	require.Error(t, err)

	store.err = nil
	enabled, err := cache.IsModuleEnabled(ctx, tenantID, "library")
	require.NoError(t, err)
	require.True(t, enabled)
}

func TestCachedFlagsConcurrentUse(t *testing.T) {
	cache, _, _ := newCache(t)
	tenantID := uuid.New()
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if i%4 == 0 {
				cache.Invalidate(tenantID)
				return
			}
			_, err := cache.IsModuleEnabled(context.Background(), tenantID, "library")
			require.NoError(t, err)
		}(i)
	}
	wg.Wait()
}
