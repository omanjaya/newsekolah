package domain

import (
	"time"

	"github.com/google/uuid"
)

// WhatsAppProviderKind is a tenant's chosen WhatsApp gateway. The
// notification platform stays vendor-neutral (docs/12-roadmap.md Fase 5:
// "adapter agar sekolah memilih gateway") by keeping this a piece of
// per-tenant configuration rather than a compile-time choice.
type WhatsAppProviderKind string

const (
	WhatsAppProviderMeta    WhatsAppProviderKind = "meta"
	WhatsAppProviderGateway WhatsAppProviderKind = "gateway"
)

func (k WhatsAppProviderKind) Valid() bool {
	switch k {
	case WhatsAppProviderMeta, WhatsAppProviderGateway:
		return true
	default:
		return false
	}
}

// WhatsAppProviderConfig is one tenant's WhatsApp send configuration.
// AccessToken and GatewayHeaderValue are the decrypted secrets: callers
// that only need to know whether a tenant is configured (e.g. an HTTP
// response) must not read them back into the response body.
type WhatsAppProviderConfig struct {
	TenantID           uuid.UUID
	Provider           WhatsAppProviderKind
	PhoneNumberID      string
	AccessToken        string
	GatewayURL         string
	GatewayHeaderName  string
	GatewayHeaderValue string
	IsActive           bool
	UpdatedAt          time.Time
}

// Configured reports whether enough is set for this provider to actually
// send, independent of IsActive (a school can save a draft configuration
// before switching it on).
func (c WhatsAppProviderConfig) Configured() bool {
	switch c.Provider {
	case WhatsAppProviderMeta:
		return c.PhoneNumberID != "" && c.AccessToken != ""
	case WhatsAppProviderGateway:
		return c.GatewayURL != ""
	default:
		return false
	}
}
