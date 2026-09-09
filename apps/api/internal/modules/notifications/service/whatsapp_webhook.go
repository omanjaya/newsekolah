package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// metaStatusPayload is the slice of Meta's webhook body this module reads:
// one or more delivery status updates per phone number. Every other field
// Meta sends (message content for inbound replies, template quality
// events, ...) is ignored: this module only tracks delivered/read
// receipts for messages it sent.
type metaStatusPayload struct {
	Entry []struct {
		Changes []struct {
			Value struct {
				Metadata struct {
					PhoneNumberID string `json:"phone_number_id"`
				} `json:"metadata"`
				Statuses []struct {
					ID     string `json:"id"`
					Status string `json:"status"`
				} `json:"statuses"`
			} `json:"value"`
		} `json:"changes"`
	} `json:"entry"`
}

// VerifyWebhookChallenge answers Meta's GET verification handshake: it
// registers the webhook URL by sending hub.mode=subscribe and the verify
// token the tenant configured in WhatsApp Business Manager, expecting the
// hub.challenge value echoed back untouched.
func (s *Service) VerifyWebhookChallenge(mode, token, challenge string) (string, bool) {
	if mode != "subscribe" || s.waVerifyToken == "" || token != s.waVerifyToken {
		return "", false
	}
	return challenge, true
}

// HandleWhatsAppStatusWebhook verifies the request signature over the raw
// body, then applies every delivered/read status it carries to the
// matching delivery log row. The body is untrusted input: it is never
// unmarshalled before the signature check, and any field this module does
// not recognize is simply skipped rather than rejected, so a Meta payload
// with fields this code doesn't know about does not fail the whole batch.
func (s *Service) HandleWhatsAppStatusWebhook(ctx context.Context, body []byte, signatureHeader string) error {
	if !domain.VerifyMetaWebhookSignature(s.waAppSecret, body, signatureHeader) {
		return domain.ErrInvalidWebhookSignature
	}

	var payload metaStatusPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return fmt.Errorf("decode whatsapp webhook payload: %w", err)
	}

	now := s.clock.Now()
	for _, entry := range payload.Entry {
		for _, change := range entry.Changes {
			phoneNumberID := change.Value.Metadata.PhoneNumberID
			if phoneNumberID == "" {
				continue
			}
			for _, status := range change.Value.Statuses {
				if err := s.applyStatus(ctx, phoneNumberID, status.ID, status.Status, now); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

// applyStatus resolves which tenant owns phoneNumberID (the webhook has
// no tenant context yet) under the platform-admin escape hatch, then
// applies the receipt inside that tenant's own transaction.
func (s *Service) applyStatus(ctx context.Context, phoneNumberID, providerMessageID, status string, at time.Time) error {
	mapped, ok := mapMetaStatus(status)
	if !ok {
		return nil // "sent", "failed", and anything else this module does not track yet
	}
	if providerMessageID == "" {
		return nil
	}

	var tenantID uuid.UUID
	err := database.WithPlatformTx(ctx, s.pool, func(ctx context.Context) error {
		cfg, err := s.repo.GetWhatsAppProviderConfigByPhoneNumberID(ctx, phoneNumberID)
		if err != nil {
			return err
		}
		tenantID = cfg.TenantID
		return nil
	})
	if err != nil {
		return nil //nolint:nilerr // an unknown phone_number_id is not this tenant's traffic; Meta retries webhooks regardless, so silently dropping it is correct
	}

	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		_, err := s.repo.UpdateWhatsAppDeliveryReceipt(ctx, tenantID, providerMessageID, mapped, at)
		return err
	})
}

func mapMetaStatus(status string) (string, bool) {
	switch status {
	case "delivered":
		return DeliveryStatusDelivered, true
	case "read":
		return DeliveryStatusRead, true
	default:
		return "", false
	}
}
