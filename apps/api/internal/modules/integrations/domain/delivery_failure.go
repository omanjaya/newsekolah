package domain

import "errors"

// DeliveryFailure says why one webhook delivery attempt failed, as a
// stable code the client translates. The Go error behind it (a dial
// error, a TLS message) stays in last_error for the server's own logs and
// is never shown to a school.
type DeliveryFailure string

const (
	// FailureNone is a delivery that has not failed (yet, or at all).
	FailureNone DeliveryFailure = ""
	// FailureHTTPStatus: the receiver answered with a non-2xx status,
	// recorded in last_status_code.
	FailureHTTPStatus DeliveryFailure = "http_status"
	// FailureTimeout: the receiver did not answer in time.
	FailureTimeout DeliveryFailure = "timeout"
	// FailureUnreachable: the request never got an answer (DNS, refused
	// connection, TLS).
	FailureUnreachable DeliveryFailure = "unreachable"
	// FailureRedirectRefused: the receiver answered with a redirect,
	// which deliveries never follow.
	FailureRedirectRefused DeliveryFailure = "redirect_refused"
	// FailureEndpointDisabled: the endpoint was disabled before the
	// attempt, so nothing was sent.
	FailureEndpointDisabled DeliveryFailure = "endpoint_disabled"
	// FailureUnknown is any other failure.
	FailureUnknown DeliveryFailure = "unknown"
)

// DeliveryError is a failed attempt with its reason code; Error is the
// underlying Go error's text.
type DeliveryError struct {
	Reason DeliveryFailure
	Err    error
}

func (e *DeliveryError) Error() string { return e.Err.Error() }

func (e *DeliveryError) Unwrap() error { return e.Err }

// NewDeliveryError wraps err with its reason code.
func NewDeliveryError(reason DeliveryFailure, err error) error {
	return &DeliveryError{Reason: reason, Err: err}
}

// AttemptFailure is what a delivery row keeps of its last failed attempt:
// the reason code for people and the error text for the server's logs.
// The zero value is "no failure".
type AttemptFailure struct {
	Reason DeliveryFailure
	Detail string
}

// FailureOf classifies a failed attempt's error; an error without a
// DeliveryError in its chain is FailureUnknown, and nil is no failure.
func FailureOf(err error) AttemptFailure {
	if err == nil {
		return AttemptFailure{}
	}
	var de *DeliveryError
	if errors.As(err, &de) {
		return AttemptFailure{Reason: de.Reason, Detail: err.Error()}
	}
	return AttemptFailure{Reason: FailureUnknown, Detail: err.Error()}
}
