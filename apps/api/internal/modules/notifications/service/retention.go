package service

import (
	"context"
	"errors"
	"time"
)

const (
	// NotificationRetention and DeliveryRetention match the brief:
	// notifications older than 180 days read, deliveries 90 days.
	NotificationRetention = 180 * 24 * time.Hour
	DeliveryRetention     = 90 * 24 * time.Hour

	// PushDeviceMaxFailures triggers the pruning job independent of the
	// immediate 404/410 removal a delivery worker already does.
	PushDeviceMaxFailures = 5
)

// RunRetention deletes read notifications and message deliveries past
// their retention window, one tenant transaction at a time.
func (s *Service) RunRetention(ctx context.Context) error {
	tenants, err := s.repo.ListActiveTenants(ctx)
	if err != nil {
		return err
	}

	now := s.clock.Now()
	var errs []error
	for _, t := range tenants {
		err := s.withTx(ctx, t.ID, func(ctx context.Context) error {
			if _, err := s.repo.DeleteReadOlderThan(ctx, t.ID, now.Add(-NotificationRetention)); err != nil {
				return err
			}
			_, err := s.repo.DeleteDeliveriesOlderThan(ctx, t.ID, now.Add(-DeliveryRetention))
			return err
		})
		if err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// PruneDevices removes push devices that are expired or have failed
// beyond PushDeviceMaxFailures, one tenant transaction at a time.
func (s *Service) PruneDevices(ctx context.Context) error {
	tenants, err := s.repo.ListActiveTenants(ctx)
	if err != nil {
		return err
	}

	var errs []error
	for _, t := range tenants {
		err := s.withTx(ctx, t.ID, func(ctx context.Context) error {
			_, err := s.repo.DeleteExpiredOrFailedPushDevices(ctx, t.ID, PushDeviceMaxFailures)
			return err
		})
		if err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// EnsurePartitions creates the notifications partition for the current
// month and the two months following it, so ordinary traffic never lands
// in the DEFAULT partition. Not tenant-scoped: it calls the schema-level
// SQL function directly.
func (s *Service) EnsurePartitions(ctx context.Context) error {
	now := s.clock.Now()
	for offset := 0; offset <= 2; offset++ {
		month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, offset, 0)
		if err := s.repo.EnsurePartition(ctx, month); err != nil {
			return err
		}
	}
	return nil
}
