package domain

import "time"

// backoffBase and backoffCap bound the retry schedule: 30s, 1m, 2m, 4m,
// 8m, 16m, 32m, then capped at 1h, per docs/14-public-api.md. Doubling on
// each attempt keeps a receiver's brief outage from being hammered while
// still retrying quickly for a one-off network blip.
const (
	backoffBase = 30 * time.Second
	backoffCap  = time.Hour
)

// BackoffDuration returns how long to wait before attempt number
// nextAttempt (1-based: the attempt about to be made, so BackoffDuration(1)
// is the delay before the very first retry, after attempt 0 failed). It is
// a pure function so the schedule itself -- not River's opaque internal
// timing -- is what unit tests pin down.
func BackoffDuration(nextAttempt int) time.Duration {
	if nextAttempt < 1 {
		nextAttempt = 1
	}
	// Cap the shift itself, not just the result, so a very large attempt
	// number cannot overflow the duration multiplication.
	shift := nextAttempt - 1
	if shift > 20 {
		shift = 20
	}
	d := backoffBase * time.Duration(uint64(1)<<uint(shift)) //nolint:gosec // shift bounded to 20 above
	if d > backoffCap || d <= 0 {
		return backoffCap
	}
	return d
}
