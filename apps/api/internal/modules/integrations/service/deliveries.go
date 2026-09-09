package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// DeliverWebhookArgs is the River job that sends one delivery attempt.
type DeliverWebhookArgs struct {
	TenantID   uuid.UUID `json:"tenant_id"`
	DeliveryID uuid.UUID `json:"delivery_id"`
}

func (DeliverWebhookArgs) Kind() string { return "integrations.deliver_webhook" }

// DispatchEvent fans an incoming domain event out to every active endpoint
// subscribed to eventType: one delivery row plus one River job per
// endpoint, inserted in the same transaction so a delivery is never
// recorded without also being enqueued (or vice versa).
func (s *Service) DispatchEvent(ctx context.Context, tenantID uuid.UUID, eventType string, eventID uuid.UUID, payload map[string]any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode webhook payload: %w", err)
	}

	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		endpoints, err := s.hooks.ListActiveEndpointsForEvent(ctx, tenantID, eventType)
		if err != nil {
			return fmt.Errorf("list webhook endpoints for %s: %w", eventType, err)
		}
		if len(endpoints) == 0 {
			return nil
		}

		tx, ok := database.TxFromContext(ctx)
		if !ok {
			return errors.New("dispatch webhook event: no transaction bound to context")
		}

		for _, ep := range endpoints {
			delivery := domain.Delivery{
				ID: uuid.Must(uuid.NewV7()), TenantID: tenantID, EndpointID: ep.Endpoint.ID,
				EventType: eventType, EventID: eventID, Payload: body, Status: domain.DeliveryPending,
			}
			created, err := s.hooks.CreateDelivery(ctx, delivery)
			if err != nil {
				return fmt.Errorf("record webhook delivery: %w", err)
			}
			args := DeliverWebhookArgs{TenantID: tenantID, DeliveryID: created.ID}
			if _, err := s.jobs.InsertTx(ctx, tx, args, &river.InsertOpts{MaxAttempts: domain.MaxDeliveryAttempts}); err != nil {
				return fmt.Errorf("enqueue webhook delivery: %w", err)
			}
		}
		return nil
	})
}

// ListDeliveries is the delivery log for the admin console: optionally
// scoped to one endpoint, newest first.
func (s *Service) ListDeliveries(ctx context.Context, tenantID uuid.UUID, endpointID uuid.NullUUID, cursorToken string, limit int) ([]domain.Delivery, string, error) {
	cursor, err := DecodeCursor(cursorToken)
	if err != nil {
		return nil, "", err
	}
	limit = clampLimit(limit)

	var items []domain.Delivery
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		items, err = s.hooks.ListDeliveries(ctx, tenantID, endpointID, cursor, limit)
		return err
	})
	if err != nil {
		return nil, "", err
	}

	nextCursor := ""
	if len(items) == limit {
		last := items[len(items)-1]
		nextCursor = EncodeCursor(last.CreatedAt, last.ID)
	}
	return items, nextCursor, nil
}

// RetryDelivery re-enqueues a delivery that stopped retrying on its own
// (domain.Delivery.Retryable): a school administrator noticed the receiver
// is back up and wants this one event redelivered without waiting for a
// new occurrence of it.
func (s *Service) RetryDelivery(ctx context.Context, tenantID, deliveryID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		delivery, err := s.hooks.GetDelivery(ctx, tenantID, deliveryID)
		if err != nil {
			return err
		}
		if !delivery.Retryable() {
			return domain.ErrDeliveryNotRetryable
		}

		tx, ok := database.TxFromContext(ctx)
		if !ok {
			return errors.New("retry webhook delivery: no transaction bound to context")
		}
		if err := s.hooks.UpdateDeliveryAttempt(ctx, tenantID, deliveryID, domain.DeliveryPending, delivery.AttemptCount, nil, "", nil, nil); err != nil {
			return fmt.Errorf("reset webhook delivery for retry: %w", err)
		}
		args := DeliverWebhookArgs{TenantID: tenantID, DeliveryID: deliveryID}
		if _, err := s.jobs.InsertTx(ctx, tx, args, &river.InsertOpts{MaxAttempts: domain.MaxDeliveryAttempts}); err != nil {
			return fmt.Errorf("enqueue retried webhook delivery: %w", err)
		}
		return nil
	})
}

// GetDeliveryForWork loads one delivery for the River worker to act on.
func (s *Service) GetDeliveryForWork(ctx context.Context, tenantID, deliveryID uuid.UUID) (domain.Delivery, error) {
	var delivery domain.Delivery
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		delivery, err = s.hooks.GetDelivery(ctx, tenantID, deliveryID)
		return err
	})
	return delivery, err
}

// GetEndpointForDelivery loads the endpoint a delivery targets, with its
// signing secret decrypted -- called only by the worker, immediately
// before signing one request, never logged or returned to any transport
// layer.
func (s *Service) GetEndpointForDelivery(ctx context.Context, tenantID, endpointID uuid.UUID) (domain.WebhookEndpoint, error) {
	var row EndpointRow
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		row, err = s.hooks.GetEndpoint(ctx, tenantID, endpointID)
		return err
	})
	if err != nil {
		return domain.WebhookEndpoint{}, err
	}
	secret, err := s.sealer.Open(row.Ciphertext)
	if err != nil {
		return domain.WebhookEndpoint{}, fmt.Errorf("decrypt webhook signing secret: %w", err)
	}
	row.Endpoint.SigningSecret = secret
	return row.Endpoint, nil
}

// RecordAttempt is called by the delivery worker after each attempt: it
// updates the delivery row and, on a terminal failure, the endpoint's
// consecutive failure streak, disabling the endpoint once it crosses
// domain.DisableAfterConsecutiveFailures. now comes from the worker's
// injected clock, never time.Now() directly.
func (s *Service) RecordAttempt(ctx context.Context, tenantID, endpointID, deliveryID uuid.UUID, attempt int, statusCode *int, sendErr error, terminal bool, now time.Time) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if sendErr == nil {
			if err := s.hooks.UpdateDeliveryAttempt(ctx, tenantID, deliveryID, domain.DeliverySuccess, attempt, statusCode, "", &now, nil); err != nil {
				return err
			}
			return s.hooks.ResetEndpointFailure(ctx, tenantID, endpointID)
		}

		status := domain.DeliveryPending
		var nextAttempt *time.Time
		if !terminal {
			at := now.Add(domain.BackoffDuration(attempt + 1))
			nextAttempt = &at
		} else {
			status = domain.DeliveryFailed
		}
		if err := s.hooks.UpdateDeliveryAttempt(ctx, tenantID, deliveryID, status, attempt, statusCode, sendErr.Error(), nil, nextAttempt); err != nil {
			return err
		}
		if !terminal {
			return nil
		}

		failures, err := s.hooks.IncrementEndpointFailure(ctx, tenantID, endpointID)
		if err != nil {
			return err
		}
		if domain.ShouldDisable(failures) {
			return s.hooks.DisableEndpoint(ctx, tenantID, endpointID, "disabled after repeated delivery failures")
		}
		return nil
	})
}
