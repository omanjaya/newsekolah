package domain

import "errors"

var (
	ErrKeyNotFound          = errors.New("api key not found")
	ErrKeyAlreadyRevoked    = errors.New("api key already revoked")
	ErrKeyPermissionExceeds = errors.New("api key permissions exceed the creating user's own permissions")
	ErrInvalidInput         = errors.New("invalid input")
	ErrEndpointNotFound     = errors.New("webhook endpoint not found")
	ErrEndpointDisabled     = errors.New("webhook endpoint is disabled")
	ErrURLNotAllowed        = errors.New("webhook url is not allowed")
	ErrEventTypeUnknown     = errors.New("unknown event type")
	ErrDeliveryNotFound     = errors.New("webhook delivery not found")
	ErrDeliveryNotRetryable = errors.New("only a failed delivery can be retried")
)
