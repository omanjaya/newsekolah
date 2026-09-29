package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// tenantLocation loads the tenant's configured IANA timezone, falling back
// to UTC if it is unset or unrecognized rather than failing every call
// over a bad setting -- mirrors attendance/service.Service.tenantLocation,
// which permits' own gate-token expiry, forced-attendance windows and
// "teacher_of_class_now" evaluation need for the same reason attendance
// does: none of those may be computed against the server's UTC clock
// directly (docs/analysis/backend-inventory.md 1.15, 1.16).
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
// timezone. Callers that combine this with a period's starts_at/ends_at
// (combineDateAndDuration) or read its weekday/hour (the
// "teacher_of_class_now" approver rule) need the local calendar day and
// time of day, not the server's UTC one. Every caller here is a BUSINESS
// decision (today's exit-permit/late-arrival/leave-request guards, duty
// windows, approver eligibility); security-sensitive time (scan-token
// expiry, auth) intentionally stays on s.clock.Now() directly -- see
// scantoken.go.
func (s *Service) tenantNow(ctx context.Context, tenantID uuid.UUID) time.Time {
	return clock.Now(ctx, s.clock).In(s.tenantLocation(ctx, tenantID))
}
