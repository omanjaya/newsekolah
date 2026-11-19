package auth

import (
	"context"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"
)

// newThrowawayRedis starts a private redis-server on a unix socket in a
// temporary directory, with persistence off, and stops it when the test
// ends. It skips when no redis-server is installed.
func newThrowawayRedis(t *testing.T) *redis.Client {
	t.Helper()
	bin, err := exec.LookPath("redis-server")
	if err != nil {
		t.Skip("redis-server not installed")
	}
	dir := t.TempDir()
	socket := filepath.Join(dir, "redis.sock")
	cmd := exec.Command(bin,
		"--port", "0",
		"--unixsocket", socket,
		"--dir", dir,
		"--save", "",
		"--appendonly", "no",
	)
	require.NoError(t, cmd.Start())
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	})

	client := redis.NewClient(&redis.Options{Network: "unix", Addr: socket})
	t.Cleanup(func() { _ = client.Close() })
	deadline := time.Now().Add(5 * time.Second)
	for {
		if err := client.Ping(context.Background()).Err(); err == nil {
			return client
		} else if time.Now().After(deadline) {
			t.Fatalf("redis-server did not come up: %v", err)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// TestRedisStoreIncrKeepsAFixedWindow reproduces audit r3-n53: every
// increment re-applied the expiry, so a counter under steady traffic (one
// school behind one NAT address loading the public branding endpoint)
// never expired, and the IP stayed rate limited for good. Only the first
// increment may set the expiry.
func TestRedisStoreIncrKeepsAFixedWindow(t *testing.T) {
	client := newThrowawayRedis(t)
	store := NewRedisStore(client)
	ctx := context.Background()
	const window = 400 * time.Millisecond

	count, err := store.Incr(ctx, "k", window)
	require.NoError(t, err)
	require.Equal(t, int64(1), count)

	// Keep hitting the key through most of the window.
	for i := 0; i < 6; i++ {
		time.Sleep(50 * time.Millisecond)
		_, err = store.Incr(ctx, "k", window)
		require.NoError(t, err)
	}
	ttl, err := client.PTTL(ctx, "k").Result()
	require.NoError(t, err)
	require.Less(t, ttl, window-200*time.Millisecond, "later increments must not push the expiry back")

	time.Sleep(ttl + 50*time.Millisecond)
	count, err = store.Incr(ctx, "k", window)
	require.NoError(t, err)
	require.Equal(t, int64(1), count, "a new window starts once the first one has run out")
}

// A counter left without an expiry (an earlier write that set none) must
// still get one, or it would never reset.
func TestRedisStoreIncrRepairsAMissingExpiry(t *testing.T) {
	client := newThrowawayRedis(t)
	store := NewRedisStore(client)
	ctx := context.Background()

	require.NoError(t, client.Set(ctx, "k", "7", 0).Err())
	count, err := store.Incr(ctx, "k", time.Minute)
	require.NoError(t, err)
	require.Equal(t, int64(8), count)

	ttl, err := client.PTTL(ctx, "k").Result()
	require.NoError(t, err)
	require.Greater(t, ttl, time.Duration(0))
}

// The in-memory fallback must agree with Redis: refused requests past the
// limit do not extend the block.
func TestIPRateLimiterWindowRunsOutUnderSteadyTraffic(t *testing.T) {
	stores := map[string]func(t *testing.T) KVStore{
		"memory": func(*testing.T) KVStore { return NewMemoryStore() },
		"redis":  func(t *testing.T) KVStore { return NewRedisStore(newThrowawayRedis(t)) },
	}
	for name, newStore := range stores {
		t.Run(name, func(t *testing.T) {
			limiter := NewIPRateLimiter(newStore(t), "branding", 2, 300*time.Millisecond)
			ctx := context.Background()

			for i := 0; i < 2; i++ {
				ok, err := limiter.Allow(ctx, "10.0.0.1")
				require.NoError(t, err)
				require.True(t, ok)
			}
			// Steady refused traffic until well past the window.
			start := time.Now()
			for time.Since(start) < 250*time.Millisecond {
				ok, err := limiter.Allow(ctx, "10.0.0.1")
				require.NoError(t, err)
				require.False(t, ok)
				time.Sleep(25 * time.Millisecond)
			}
			require.Eventually(t, func() bool {
				ok, err := limiter.Allow(ctx, "10.0.0.1")
				return err == nil && ok
			}, 2*time.Second, 25*time.Millisecond, "the budget comes back once the window runs out")
		})
	}
}
