package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// tenantLocation is the tenant's own timezone: the request tenant's when
// the context carries it (every authenticated request, so the per-request
// permission check costs no extra query), read from tenants otherwise (an
// event delivered outside a request). An unset, unknown or unreadable
// zone falls back to UTC rather than failing the caller.
func (s *Service) tenantLocation(ctx context.Context, tenantID uuid.UUID) *time.Location {
	if t, ok := tenant.FromContext(ctx); ok && t.ID == tenantID {
		return t.Location()
	}
	tz, err := s.repo.GetTenantTimezone(ctx, tenantID)
	if err != nil {
		return time.UTC
	}
	return clock.Location(tz)
}

// tenantDate is the school's calendar date at instant at. Duty windows
// (starts_on/ends_on) are school dates: before 08:00 in Asia/Makassar the
// UTC date of the instant is still yesterday, which would keep a duty that
// ended yesterday active and hold back one that starts today.
func (s *Service) tenantDate(ctx context.Context, tenantID uuid.UUID, at time.Time) time.Time {
	return clock.LocalDate(at, s.tenantLocation(ctx, tenantID))
}
