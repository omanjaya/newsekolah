package auth

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoginRateLimiterIgnoresSuccessfulLogins(t *testing.T) {
	ctx := context.Background()
	l := NewLoginRateLimiter(NewMemoryStore())

	// A whole class signing in from one school IP: many accounts, no
	// failures, must never trip the per-IP limit.
	for i := 0; i < 300; i++ {
		allowed, err := l.Allow(ctx, "t1", fmt.Sprintf("student%d", i), "10.0.0.1")
		require.NoError(t, err)
		require.True(t, allowed, "login %d from the shared IP was refused", i)
	}
}

func TestLoginRateLimiterBlocksAccountAfterFiveFailures(t *testing.T) {
	ctx := context.Background()
	l := NewLoginRateLimiter(NewMemoryStore())

	for i := 0; i < 5; i++ {
		allowed, err := l.Allow(ctx, "t1", "guru", "10.0.0.1")
		require.NoError(t, err)
		require.True(t, allowed)
		require.NoError(t, l.RecordFailure(ctx, "t1", "guru", "10.0.0.1"))
	}
	allowed, err := l.Allow(ctx, "t1", "guru", "10.0.0.1")
	require.NoError(t, err)
	require.False(t, allowed, "sixth attempt after five failures must be refused")

	// Other accounts on the same IP are unaffected by one account's
	// failures, and the same username in another tenant is separate.
	allowed, err = l.Allow(ctx, "t1", "siswa", "10.0.0.1")
	require.NoError(t, err)
	require.True(t, allowed)
	allowed, err = l.Allow(ctx, "t2", "guru", "10.0.0.1")
	require.NoError(t, err)
	require.True(t, allowed)
}

func TestLoginRateLimiterBlocksIPAfterManyFailures(t *testing.T) {
	ctx := context.Background()
	l := NewLoginRateLimiter(NewMemoryStore())

	// Password spraying: one failure each across many accounts from one IP.
	for i := 0; i < 100; i++ {
		require.NoError(t, l.RecordFailure(ctx, "t1", fmt.Sprintf("user%d", i), "203.0.113.9"))
	}
	allowed, err := l.Allow(ctx, "t1", "fresh-account", "203.0.113.9")
	require.NoError(t, err)
	require.False(t, allowed, "IP with 100 failures must be refused")

	allowed, err = l.Allow(ctx, "t1", "fresh-account", "203.0.113.10")
	require.NoError(t, err)
	require.True(t, allowed, "a different IP is unaffected")
}
