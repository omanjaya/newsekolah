// Package domain holds the integrations module's entities and pure rules:
// an API key's lifecycle and IP allow list, a webhook endpoint's event
// subscription and disable condition, and the delivery retry schedule.
// Persistence, hashing, and network calls live in service/ and repository/.
package domain

import (
	"net"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	MaxKeyNameLength = 120
	MinRateLimit     = 1
	MaxRateLimit     = 6000
	DefaultRateLimit = 60
)

// APIKey is one named credential a school administrator issued for machine
// access. Only SecretHash is ever persisted; the plaintext secret exists
// once, at creation, and is handed back to the caller then only.
type APIKey struct {
	ID                 uuid.UUID
	TenantID           uuid.UUID
	Name               string
	SecretHash         string
	Permissions        []string
	CreatedBy          uuid.UUID
	IPAllowlist        []string
	RateLimitPerMinute int
	ExpiresAt          *time.Time
	RevokedAt          *time.Time
	LastUsedAt         *time.Time
	CreatedAt          time.Time
}

// Active reports whether the key can still authenticate a request: not
// revoked, and not past its expiry (a key with no expiry never lapses on
// its own).
func (k APIKey) Active(now time.Time) bool {
	if k.RevokedAt != nil {
		return false
	}
	if k.ExpiresAt != nil && !now.Before(*k.ExpiresAt) {
		return false
	}
	return true
}

// IPAllowed reports whether ip may use this key. An empty allow list means
// no IP restriction, matching how the console presents the field: leaving
// it blank is "any address", not "no address".
func (k APIKey) IPAllowed(ip string) bool {
	if len(k.IPAllowlist) == 0 {
		return true
	}
	candidate := net.ParseIP(ip)
	if candidate == nil {
		return false
	}
	for _, entry := range k.IPAllowlist {
		if ipEntryMatches(entry, candidate) {
			return true
		}
	}
	return false
}

func ipEntryMatches(entry string, candidate net.IP) bool {
	entry = strings.TrimSpace(entry)
	if strings.Contains(entry, "/") {
		_, network, err := net.ParseCIDR(entry)
		return err == nil && network.Contains(candidate)
	}
	single := net.ParseIP(entry)
	return single != nil && single.Equal(candidate)
}

// ValidateIPAllowlist rejects an entry that is neither a valid IP address
// nor a valid CIDR block, so a typo is caught at creation, not at the next
// failed request months later.
func ValidateIPAllowlist(entries []string) error {
	for _, entry := range entries {
		trimmed := strings.TrimSpace(entry)
		if trimmed == "" {
			return ErrInvalidInput
		}
		if strings.Contains(trimmed, "/") {
			if _, _, err := net.ParseCIDR(trimmed); err != nil {
				return ErrInvalidInput
			}
			continue
		}
		if net.ParseIP(trimmed) == nil {
			return ErrInvalidInput
		}
	}
	return nil
}

// ClampRateLimit keeps a requested per-minute limit within the bounds the
// migration's check constraint enforces, defaulting an unset (zero) value
// instead of rejecting it.
func ClampRateLimit(perMinute int) int {
	if perMinute <= 0 {
		return DefaultRateLimit
	}
	if perMinute > MaxRateLimit {
		return MaxRateLimit
	}
	if perMinute < MinRateLimit {
		return MinRateLimit
	}
	return perMinute
}
