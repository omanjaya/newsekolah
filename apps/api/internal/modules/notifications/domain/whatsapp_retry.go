package domain

import "time"

// WhatsAppRetryBackoff is the delay before retrying a failed WhatsApp send:
// exponential from 30 seconds, doubling on each attempt, capped at one
// hour. attempt is the 1-based number of attempts made so far (River's
// job.Attempt immediately after a failed attempt). A non-positive attempt
// is treated as the first attempt.
func WhatsAppRetryBackoff(attempt int) time.Duration {
	const (
		base     = 30 * time.Second
		maxDelay = time.Hour
		maxShift = 7 // base * 2^7 = 3840s, already past maxDelay so the cap below always applies beyond this
	)
	if attempt < 1 {
		attempt = 1
	}
	shift := attempt - 1
	if shift > maxShift {
		shift = maxShift
	}
	delay := base * time.Duration(uint64(1)<<uint(shift)) //nolint:gosec // shift is clamped to maxShift above
	if delay > maxDelay {
		delay = maxDelay
	}
	return delay
}
