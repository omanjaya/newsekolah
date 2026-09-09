package domain

import (
	"testing"
	"time"
)

func TestAPIKey_Active(t *testing.T) {
	now := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	future := now.Add(time.Hour)
	past := now.Add(-time.Hour)

	t.Run("no expiry, not revoked", func(t *testing.T) {
		if !(APIKey{}).Active(now) {
			t.Error("expected active")
		}
	})
	t.Run("expires in the future", func(t *testing.T) {
		if !(APIKey{ExpiresAt: &future}).Active(now) {
			t.Error("expected active")
		}
	})
	t.Run("expired", func(t *testing.T) {
		if (APIKey{ExpiresAt: &past}).Active(now) {
			t.Error("expected inactive")
		}
	})
	t.Run("expires exactly now is no longer active", func(t *testing.T) {
		if (APIKey{ExpiresAt: &now}).Active(now) {
			t.Error("expected inactive at the expiry instant")
		}
	})
	t.Run("revoked", func(t *testing.T) {
		if (APIKey{RevokedAt: &past}).Active(now) {
			t.Error("expected inactive")
		}
	})
}

func TestAPIKey_IPAllowed(t *testing.T) {
	t.Run("empty allow list permits any address", func(t *testing.T) {
		if !(APIKey{}).IPAllowed("203.0.113.5") {
			t.Error("expected allowed")
		}
	})
	t.Run("exact match", func(t *testing.T) {
		k := APIKey{IPAllowlist: []string{"203.0.113.5"}}
		if !k.IPAllowed("203.0.113.5") {
			t.Error("expected allowed")
		}
		if k.IPAllowed("203.0.113.6") {
			t.Error("expected not allowed")
		}
	})
	t.Run("cidr match", func(t *testing.T) {
		k := APIKey{IPAllowlist: []string{"203.0.113.0/24"}}
		if !k.IPAllowed("203.0.113.200") {
			t.Error("expected allowed within the block")
		}
		if k.IPAllowed("203.0.114.1") {
			t.Error("expected not allowed outside the block")
		}
	})
	t.Run("malformed candidate address is never allowed", func(t *testing.T) {
		k := APIKey{IPAllowlist: []string{"203.0.113.0/24"}}
		if k.IPAllowed("not-an-ip") {
			t.Error("expected not allowed")
		}
	})
}

func TestValidateIPAllowlist(t *testing.T) {
	if err := ValidateIPAllowlist([]string{"203.0.113.5", "10.0.0.0/8"}); err != nil {
		t.Errorf("expected valid entries to pass, got %v", err)
	}
	if err := ValidateIPAllowlist([]string{"not-an-ip"}); err == nil {
		t.Error("expected an invalid entry to fail")
	}
	if err := ValidateIPAllowlist([]string{"10.0.0.0/999"}); err == nil {
		t.Error("expected an invalid cidr to fail")
	}
	if err := ValidateIPAllowlist([]string{""}); err == nil {
		t.Error("expected an empty entry to fail")
	}
}

func TestClampRateLimit(t *testing.T) {
	cases := []struct {
		in, want int
	}{
		{0, DefaultRateLimit},
		{-5, DefaultRateLimit},
		{10, 10},
		{MaxRateLimit + 1, MaxRateLimit},
	}
	for _, tc := range cases {
		if got := ClampRateLimit(tc.in); got != tc.want {
			t.Errorf("ClampRateLimit(%d) = %d, want %d", tc.in, got, tc.want)
		}
	}
}
