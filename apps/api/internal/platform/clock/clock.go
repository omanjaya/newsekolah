// Package clock provides an injectable time source so domain and service code
// never call time.Now() directly, keeping business logic deterministic in tests.
package clock

import "time"

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
