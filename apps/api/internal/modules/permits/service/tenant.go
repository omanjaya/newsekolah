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

// localDayRange turns an inclusive range of calendar dates (SQL DATE
// values, which arrive as midnight UTC) into the instants that bound
// those days in loc: 00:00 local on the first day to 23:59:59 local on the
// last. Reading the DATE as an instant instead would shift the window by
// the tenant's UTC offset -- in a UTC+8 school a one-day leave would reach
// 07:59 of the next morning and miss the first hours of its own day.
func localDayRange(startsOn, endsOn time.Time, loc *time.Location) (from, to time.Time) {
	sy, sm, sd := startsOn.Date()
	ey, em, ed := endsOn.Date()
	from = time.Date(sy, sm, sd, 0, 0, 0, 0, loc)
	to = time.Date(ey, em, ed+1, 0, 0, 0, 0, loc).Add(-time.Second)
	return from, to
}
