package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
)

// GetWhatsAppDeliveryForAPI returns one delivery log row, for rendering
// the result of a resend.
func (s *Service) GetWhatsAppDeliveryForAPI(ctx context.Context, tenantID, id uuid.UUID) (WhatsAppDelivery, error) {
	var out WhatsAppDelivery
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.GetWhatsAppDelivery(ctx, tenantID, id)
		return err
	})
	return out, err
}

// ListWhatsAppDeliveries returns a page of the WhatsApp delivery log,
// newest first, optionally filtered to one status.
func (s *Service) ListWhatsAppDeliveries(ctx context.Context, tenantID uuid.UUID, status, cursorStr string, limit int) ([]WhatsAppDelivery, string, error) {
	cursor, err := DecodeCursor(cursorStr)
	if err != nil {
		return nil, "", fmt.Errorf("%w: %s", domain.ErrInvalidChannel, err)
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	var deliveries []WhatsAppDelivery
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		deliveries, err = s.repo.ListWhatsAppDeliveries(ctx, tenantID, status, cursor, limit+1)
		return err
	})
	if err != nil {
		return nil, "", err
	}

	next := ""
	if len(deliveries) > limit {
		last := deliveries[limit-1]
		next = EncodeCursor(last.CreatedAt, last.ID)
		deliveries = deliveries[:limit]
	}
	return deliveries, next, nil
}

// ResendWhatsAppDelivery re-sends a delivery that has already been
// attempted: it inserts a new delivery row (the log keeps every attempt,
// old and new, per docs/12-roadmap.md's "log pengiriman") carrying the
// same recipient, template, and rendered payload, and enqueues a fresh job
// for it.
func (s *Service) ResendWhatsAppDelivery(ctx context.Context, tenantID, deliveryID uuid.UUID) (uuid.UUID, error) {
	var newDeliveryID uuid.UUID
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		original, err := s.repo.GetWhatsAppDelivery(ctx, tenantID, deliveryID)
		if err != nil {
			return err
		}

		tx, ok := txFromContext(ctx)
		if !ok {
			return fmt.Errorf("resend whatsapp delivery: no transaction in context")
		}

		newDeliveryID, err = s.repo.InsertDelivery(ctx, tenantID, original.NotificationID, original.CreatedAt, domain.ChannelWhatsApp, original.Provider, original.Target)
		if err != nil {
			return fmt.Errorf("insert resend delivery: %w", err)
		}
		if err := s.repo.SetDeliveryTemplateAndPayload(ctx, tenantID, newDeliveryID, original.TemplateID, original.Payload); err != nil {
			return fmt.Errorf("record resend payload: %w", err)
		}

		args := DeliverWhatsAppArgs{
			TenantID: tenantID, NotificationID: original.NotificationID,
			DeliveryID: newDeliveryID, ToPhone: original.Target, Message: original.Payload,
			TemplateID: original.TemplateID,
		}
		if original.TemplateID.Valid {
			tmpl, err := s.repo.GetWhatsAppTemplate(ctx, tenantID, original.TemplateID.UUID)
			if err != nil {
				return fmt.Errorf("load template for resend: %w", err)
			}
			args.MetaTemplateName, args.Locale = tmpl.MetaTemplateName, tmpl.Locale
		}
		_, err = s.jobs.InsertTx(ctx, tx, args, &river.InsertOpts{MaxAttempts: deliveryMaxAttempts})
		if err != nil {
			return fmt.Errorf("enqueue resend job: %w", err)
		}
		return nil
	})
	return newDeliveryID, err
}

// SendWhatsAppTemplate renders a named template and enqueues one WhatsApp
// delivery for it, recording the delivery row up front (as every other
// channel does) so the log has an entry even if the job never runs.
// Callers outside this module reach it through wiring, not directly --
// today only the resend action and manual "send test message" flows use
// it; wiring individual notification kinds to specific templates is left
// for a follow-up (see the module's rollout notes).
func (s *Service) SendWhatsAppTemplate(ctx context.Context, tenantID, notificationID uuid.UUID, toPhone, templateName string, vars map[string]string) (uuid.UUID, error) {
	var deliveryID uuid.UUID
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		tmpl, err := s.repo.GetWhatsAppTemplateByName(ctx, tenantID, templateName)
		if err != nil {
			return err
		}
		rendered, err := domain.RenderTemplate(tmpl, vars)
		if err != nil {
			return err
		}

		tx, ok := txFromContext(ctx)
		if !ok {
			return fmt.Errorf("send whatsapp template: no transaction in context")
		}

		notification, err := s.repo.GetNotification(ctx, tenantID, notificationID)
		if err != nil {
			return fmt.Errorf("load notification: %w", err)
		}

		deliveryID, err = s.repo.InsertDelivery(ctx, tenantID, notificationID, notification.CreatedAt, domain.ChannelWhatsApp, "whatsapp", toPhone)
		if err != nil {
			return fmt.Errorf("insert delivery: %w", err)
		}
		if err := s.repo.SetDeliveryTemplateAndPayload(ctx, tenantID, deliveryID, uuid.NullUUID{UUID: tmpl.ID, Valid: true}, rendered); err != nil {
			return fmt.Errorf("record payload: %w", err)
		}

		_, err = s.jobs.InsertTx(ctx, tx, DeliverWhatsAppArgs{
			TenantID: tenantID, NotificationID: notificationID, NotificationCreatedAt: notification.CreatedAt,
			DeliveryID: deliveryID, ToPhone: toPhone, Message: rendered,
			TemplateID: uuid.NullUUID{UUID: tmpl.ID, Valid: true}, MetaTemplateName: tmpl.MetaTemplateName, Locale: tmpl.Locale,
		}, &river.InsertOpts{MaxAttempts: deliveryMaxAttempts})
		if err != nil {
			return fmt.Errorf("enqueue job: %w", err)
		}
		return nil
	})
	return deliveryID, err
}
