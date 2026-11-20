// Package clock provides an injectable time source so domain and service code
// never call time.Now() directly, keeping business logic deterministic in tests.
package clock

import (
	"context"
	"sync"
	"time"
)

type Clock interface {
	Now() time.Time
}

type Real struct{}

func (Real) Now() time.Time { return time.Now().UTC() }

// Frozen is a Clock that always returns the same instant, for tests.
type Frozen struct {
	At time.Time
}

func (f Frozen) Now() time.Time { return f.At }

type simulationTimeKey struct{}

// WithTime attaches a business-time override to one request context. Only
// authorized HTTP middleware should call it for user requests; it does not
// change the process clock used by authentication, sessions, jobs, or audit.
func WithTime(ctx context.Context, at time.Time) context.Context {
	return context.WithValue(ctx, simulationTimeKey{}, at)
}

// Now returns the request's simulated business time, when present, or the
// injected clock's real/frozen time otherwise. Services opt in at the exact
// business-time decisions that should be testable.
func Now(ctx context.Context, fallback Clock) time.Time {
	if at, ok := ctx.Value(simulationTimeKey{}).(time.Time); ok {
		return at
	}
	return fallback.Now()
}

// Location resolves an IANA timezone name (a tenant's tenants.timezone)
// to a *time.Location, falling back to UTC when the name is empty or
// unknown: a bad setting must not fail every date decision a request
// makes. Code that turns an instant into a school's calendar date
// resolves the zone through this one rule.
//
// Results, the UTC fallback for an unknown name included, are cached per
// name: time.LoadLocation reads and parses the zoneinfo file on every
// call, and the authz path resolves the tenant zone on every request.
func Location(name string) *time.Location {
	if name == "" {
		return time.UTC
	}
	if loc, ok := locations.Load(name); ok {
		return loc.(*time.Location)
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		loc = time.UTC
	}
	locations.Store(name, loc)
	return loc
}

// locations caches Location's result per timezone name.
var locations sync.Map

// LocalDate is the calendar date t falls on in loc, as a midnight-UTC
// time.Time: the form a Postgres date column stores unchanged and that
// reportdoc.FormatDate and openapi Date values render without shifting a
// day. Use it wherever "today", a month or a day bucket is derived from
// an instant: the UTC date of an instant is still yesterday for a school
// east of Greenwich until UTC midnight catches up (Asia/Makassar, UTC+8,
// before 08:00 local).
func LocalDate(t time.Time, loc *time.Location) time.Time {
	if loc == nil {
		loc = time.UTC
	}
	y, m, d := t.In(loc).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}
