package auth

import (
	"context"
	"testing"
	"time"
)

// TestMemoryStoreSetNX covers the single-instance fallback's atomic claim
// primitive that httpx.Idempotent relies on to lock out concurrent
// duplicates when Redis is not configured.
func TestMemoryStoreSetNX(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	acquired, err := store.SetNX(ctx, "k", "first", time.Minute)
	if err != nil {
		t.Fatalf("first SetNX: unexpected error: %v", err)
	}
	if !acquired {
		t.Fatal("first SetNX on a fresh key must succeed")
	}

	acquired, err = store.SetNX(ctx, "k", "second", time.Minute)
	if err != nil {
		t.Fatalf("second SetNX: unexpected error: %v", err)
	}
	if acquired {
		t.Fatal("second SetNX on the same still-live key must fail")
	}

	v, ok, err := store.Get(ctx, "k")
	if err != nil || !ok {
		t.Fatalf("Get after SetNX race: v=%q ok=%v err=%v", v, ok, err)
	}
	if v != "first" {
		t.Fatalf("value = %q, want %q (the loser must not overwrite it)", v, "first")
	}
}

// TestMemoryStoreSetNXAfterExpiry reproduces the "crashed mid-flight"
// idempotency scenario: a claim's TTL passes without ever being replaced
// by a finished result, and a later retry must be able to claim the key
// again rather than being locked out forever.
func TestMemoryStoreSetNXAfterExpiry(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	if _, err := store.SetNX(ctx, "k", "first", time.Millisecond); err != nil {
		t.Fatalf("first SetNX: unexpected error: %v", err)
	}
	time.Sleep(5 * time.Millisecond)

	acquired, err := store.SetNX(ctx, "k", "second", time.Minute)
	if err != nil {
		t.Fatalf("SetNX after expiry: unexpected error: %v", err)
	}
	if !acquired {
		t.Fatal("SetNX must succeed once the earlier claim's TTL has passed")
	}
}
