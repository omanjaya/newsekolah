package service

import (
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
)

// auditKey is what an audit entry keeps of an API key: never the secret
// or its hash.
type auditKey struct {
	Name               string     `json:"name"`
	Permissions        []string   `json:"permissions"`
	IPAllowlist        []string   `json:"ip_allowlist"`
	RateLimitPerMinute int        `json:"rate_limit_per_minute"`
	ExpiresAt          *time.Time `json:"expires_at,omitempty"`
	RevokedAt          *time.Time `json:"revoked_at,omitempty"`
}

func toAuditKey(k domain.APIKey) auditKey {
	return auditKey{
		Name: k.Name, Permissions: k.Permissions, IPAllowlist: k.IPAllowlist,
		RateLimitPerMinute: k.RateLimitPerMinute, ExpiresAt: k.ExpiresAt, RevokedAt: k.RevokedAt,
	}
}

// auditEndpoint is what an audit entry keeps of a webhook endpoint: never
// the signing secret.
type auditEndpoint struct {
	URL         string   `json:"url"`
	Description string   `json:"description"`
	EventTypes  []string `json:"event_types"`
	Status      string   `json:"status"`
}

func toAuditEndpoint(e domain.WebhookEndpoint) auditEndpoint {
	return auditEndpoint{URL: e.URL, Description: e.Description, EventTypes: e.EventTypes, Status: string(e.Status)}
}
