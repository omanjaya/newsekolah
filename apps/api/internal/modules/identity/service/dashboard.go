package service

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// LoginHistogramWindow matches the old app's "7 hari terakhir" window
// (reference/sion-rebuild-go admin_dashboard.go).
const LoginHistogramWindow = 7 * 24 * time.Hour

// DashboardActiveUsers returns active user counts per profile_kind, for
// the admin dashboard (modules/analytics).
func (s *Service) DashboardActiveUsers(ctx context.Context, tenantID uuid.UUID) (map[string]int, error) {
	var out map[string]int
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ActiveUsersByProfileKind(ctx, tenantID)
		return err
	})
	return out, err
}

// DashboardLoginHistogram returns a 24-entry (hour 0-23, tenant-local)
// slice of successful-login counts over the last 7 days.
func (s *Service) DashboardLoginHistogram(ctx context.Context, tenantID uuid.UUID) ([24]int, error) {
	var buckets [24]int
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		// Falls back to UTC on an unset or unrecognized tenant timezone,
		// same as permits/attendance's tenantLocation, rather than
		// failing the whole dashboard over a bad setting.
		tz, err := s.repo.GetTenantTimezone(ctx, tenantID)
		if err != nil {
			return err
		}
		if _, err := time.LoadLocation(tz); tz == "" || err != nil {
			tz = "UTC"
		}
		byHour, err := s.repo.LoginHistogramByHour(ctx, tenantID, s.clock.Now().Add(-LoginHistogramWindow), tz)
		if err != nil {
			return err
		}
		for hour, count := range byHour {
			if hour >= 0 && hour < 24 {
				buckets[hour] = count
			}
		}
		return nil
	})
	return buckets, err
}
