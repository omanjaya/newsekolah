package wiring

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// FlagStore loads a tenant's explicit feature-flag rows as module -> enabled.
type FlagStore interface {
	StoredFlags(ctx context.Context, tenantID uuid.UUID) (map[string]bool, error)
}

// DefaultFlagCacheTTL bounds how long another instance's flag change can go
// unnoticed; a change made on this instance is visible at once through
// Invalidate.
const DefaultFlagCacheTTL = 15 * time.Second

type flagCacheEntry struct {
	flags   map[string]bool
	expires time.Time
}

// CachedFlags answers IsModuleEnabled from an in-process, per-tenant cache of
// the whole flag map, so the central module gate costs a map lookup instead
// of a transaction on every request. It is safe for concurrent use.
type CachedFlags struct {
	store FlagStore
	clock clock.Clock
	ttl   time.Duration
	// gated is the toggleable module list DisabledModules is restricted to.
	gated []string

	mu      sync.Mutex
	entries map[uuid.UUID]flagCacheEntry
	// epoch increments on every Invalidate. A load that began before an
	// invalidation must not repopulate the cache with data that may predate
	// the change, so it only stores its result when epoch is unchanged.
	epoch uint64
}

func NewCachedFlags(store FlagStore, clk clock.Clock, ttl time.Duration, gated []string) *CachedFlags {
	return &CachedFlags{store: store, clock: clk, ttl: ttl, gated: gated, entries: map[uuid.UUID]flagCacheEntry{}}
}

// IsModuleEnabled reports whether module is on for the tenant. feature_flags
// is opt-out: a module without a row is enabled.
func (c *CachedFlags) IsModuleEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error) {
	flags, err := c.flagsFor(ctx, tenantID)
	if err != nil {
		return false, err
	}
	enabled, ok := flags[module]
	if !ok {
		return true, nil
	}
	return enabled, nil
}

// Invalidate drops the tenant's cached flags; the next read reloads them.
func (c *CachedFlags) Invalidate(tenantID uuid.UUID) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, tenantID)
	c.epoch++
}

func (c *CachedFlags) flagsFor(ctx context.Context, tenantID uuid.UUID) (map[string]bool, error) {
	now := c.clock.Now()
	c.mu.Lock()
	if e, ok := c.entries[tenantID]; ok && now.Before(e.expires) {
		c.mu.Unlock()
		return e.flags, nil
	}
	epoch := c.epoch
	c.mu.Unlock()

	flags, err := c.store.StoredFlags(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.epoch == epoch {
		c.entries[tenantID] = flagCacheEntry{flags: flags, expires: now.Add(c.ttl)}
	}
	return flags, nil
}

// DisabledModules lists the tenant's switched-off modules, restricted to
// gated (the known toggleable module names) and sorted, so unknown rows in
// feature_flags never leak to clients. It satisfies the identity module's
// disabled-modules reader.
func (c *CachedFlags) DisabledModules(ctx context.Context, tenantID uuid.UUID) ([]string, error) {
	flags, err := c.flagsFor(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	disabled := make([]string, 0, len(c.gated))
	for _, module := range c.gated {
		if enabled, ok := flags[module]; ok && !enabled {
			disabled = append(disabled, module)
		}
	}
	sort.Strings(disabled)
	return disabled, nil
}
