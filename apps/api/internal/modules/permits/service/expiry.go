package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ExpireHangingInstances force-closes every in-progress workflow instance
// still open past its opening day, for every tenant, so a stuck flow
// never blocks the next day's attendance (docs/02-system-design.md
// section 6.2 step 4; bug fix vs. the old app, which had no such job).
// Run periodically (transport/jobs), not just once at midnight, so a
// tenant crossing midnight in any timezone is caught promptly.
func (s *Service) ExpireHangingInstances(ctx context.Context) (int, error) {
	tenants, err := s.repo.ListActiveTenants(ctx)
	if err != nil {
		return 0, fmt.Errorf("list tenants for expiry: %w", err)
	}

	total := 0
	for _, t := range tenants {
		loc, err := time.LoadLocation(t.Timezone)
		if err != nil {
			loc = time.UTC
		}
		midnight := startOfDay(s.clock.Now().In(loc))

		err = s.withTx(ctx, t.ID, func(ctx context.Context) error {
			expired, err := s.repo.ExpireHangingInstances(ctx, t.ID, midnight)
			total += len(expired)
			return err
		})
		if err != nil {
			return total, fmt.Errorf("expire hanging instances for tenant %s: %w", t.ID, err)
		}
	}
	return total, nil
}

func startOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

// HasBlockingLateArrival implements the AttendanceBlocker interface this
// module exports for the attendance module (see the docstring on
// AttendanceBlocker in service.go for the post-merge wiring point).
func (s *Service) HasBlockingLateArrival(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (bool, error) {
	var blocked bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		blocked, err = s.repo.HasInProgressLateArrivalOn(ctx, tenantID, studentUserID, date)
		return err
	})
	return blocked, err
}
