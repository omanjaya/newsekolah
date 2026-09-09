package service

import (
	"context"

	"github.com/google/uuid"
)

// Delivery status values recorded in message_deliveries. Matches the
// table's check constraint.
const (
	DeliveryStatusSent   = "sent"
	DeliveryStatusFailed = "failed"
)

// RecordDeliveryAttempt is called by every "notifications.deliver_*"
// worker (transport/jobs) after it has actually tried to send, win or
// lose: docs/06 section 10 calls for each attempt to be recorded.
func (s *Service) RecordDeliveryAttempt(ctx context.Context, tenantID, deliveryID uuid.UUID, status, providerMessageID, errMsg string) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.RecordDeliveryAttempt(ctx, tenantID, deliveryID, status, providerMessageID, errMsg)
	})
}

// RemovePushDevice deletes a device the provider reported as permanently
// gone (notify.ErrDeviceGone: web push 404/410, APNs "Unregistered", FCM
// "UNREGISTERED").
func (s *Service) RemovePushDevice(ctx context.Context, tenantID, deviceID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeletePushDeviceByID(ctx, tenantID, deviceID)
	})
}

// IncrementPushDeviceFailure records a transient push failure that did not
// report the device as gone; PruneDevices removes it once the count
// crosses PushDeviceMaxFailures.
func (s *Service) IncrementPushDeviceFailure(ctx context.Context, tenantID, deviceID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.IncrementPushDeviceFailure(ctx, tenantID, deviceID)
	})
}

// TouchPushDeviceUsed records a successful push, resetting the failure
// count (mirrors the sqlc query TouchPushDeviceUsed).
func (s *Service) TouchPushDeviceUsed(ctx context.Context, tenantID, deviceID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.TouchPushDeviceUsed(ctx, tenantID, deviceID, s.clock.Now())
	})
}
