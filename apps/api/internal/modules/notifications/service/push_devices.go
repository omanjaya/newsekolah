package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
)

// pushDeviceDefaultTTL is how long a registration is trusted without a
// renewed registration call; the pruning job (PruneDevices) removes rows
// past this even if the provider never reported them as gone.
const pushDeviceDefaultTTL = 180 * 24 * time.Hour

func (s *Service) RegisterPushDevice(ctx context.Context, tenantID, userID uuid.UUID, reg PushDeviceRegistration) (domain.PushDevice, error) {
	if !reg.Platform.Valid() {
		return domain.PushDevice{}, domain.ErrInvalidPlatform
	}
	var device domain.PushDevice
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		device, err = s.repo.UpsertPushDevice(ctx, tenantID, userID, reg, s.clock.Now().Add(pushDeviceDefaultTTL))
		return err
	})
	return device, err
}

func (s *Service) UnregisterPushDevice(ctx context.Context, tenantID, userID uuid.UUID, tokenOrEndpoint string) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeletePushDeviceByEndpoint(ctx, tenantID, userID, tokenOrEndpoint)
	})
}

// GetPushDevice is used by the "notifications.deliver_push" worker to
// resolve the device a delivery job targets.
func (s *Service) GetPushDevice(ctx context.Context, tenantID, deviceID uuid.UUID) (domain.PushDevice, error) {
	var device domain.PushDevice
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		device, err = s.repo.GetPushDeviceByID(ctx, tenantID, deviceID)
		return err
	})
	return device, err
}

func (s *Service) ListPushDevices(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.PushDevice, error) {
	var devices []domain.PushDevice
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		devices, err = s.repo.ListPushDevicesForUser(ctx, tenantID, userID)
		return err
	})
	return devices, err
}
