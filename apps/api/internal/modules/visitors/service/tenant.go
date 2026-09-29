package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// tenantLocation loads the tenant's configured IANA timezone, falling back
// to UTC if it is unset or unrecognized rather than failing every call over
// a bad setting -- mirrors permits/service.Service.tenantLocation, which
// visitors' own HasActiveDuty check (readerRole) needs for the same reason
// permits does (docs/testing-time-simulation.md).
func (s *Service) tenantLocation(ctx context.Context, tenantID uuid.UUID) *time.Location {
	tz, err := s.repo.GetTenantTimezone(ctx, tenantID)
	if err != nil || tz == "" {
		return time.UTC
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return time.UTC
	}
	return loc
}

// tenantNow is the request's business-time instant -- the simulated
// business clock (docs/testing-time-simulation.md) when the request
// carries one, s.clock.Now() otherwise -- converted into the tenant's own
// timezone. HasActiveDuty's "today" is a BUSINESS decision (who currently
// holds a security/leadership duty), so it must use this, not
// clock.Now(ctx, s.clock) directly, and never the Postgres session's own
// (UTC) current_date.
func (s *Service) tenantNow(ctx context.Context, tenantID uuid.UUID) time.Time {
	return clock.Now(ctx, s.clock).In(s.tenantLocation(ctx, tenantID))
}
