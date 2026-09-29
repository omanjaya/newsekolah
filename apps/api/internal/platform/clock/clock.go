// Package clock provides an injectable time source so domain and service code
// never call time.Now() directly, keeping business logic deterministic in tests.
package clock

import (
	"context"
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
