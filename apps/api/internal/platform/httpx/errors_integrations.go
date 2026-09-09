package httpx

import "net/http"

var (
	ErrAPIKeyNotFound          = NewError(http.StatusNotFound, "API_KEY_NOT_FOUND")
	ErrAPIKeyRevoked           = NewError(http.StatusConflict, "API_KEY_ALREADY_REVOKED")
	ErrAPIKeyPermissionExceeds = NewError(http.StatusBadRequest, "API_KEY_PERMISSION_EXCEEDS_USER")
	ErrAPIKeyInvalid           = NewError(http.StatusUnauthorized, "API_KEY_INVALID")
	ErrAPIKeyExpired           = NewError(http.StatusUnauthorized, "API_KEY_EXPIRED")
	ErrAPIKeyRevokedAuth       = NewError(http.StatusUnauthorized, "API_KEY_REVOKED")
	ErrAPIKeyIPNotAllowed      = NewError(http.StatusForbidden, "API_KEY_IP_NOT_ALLOWED")
	ErrAPIKeyRateLimited       = NewError(http.StatusTooManyRequests, "API_KEY_RATE_LIMITED")

	ErrWebhookEndpointNotFound  = NewError(http.StatusNotFound, "WEBHOOK_ENDPOINT_NOT_FOUND")
	ErrWebhookEndpointDisabled  = NewError(http.StatusConflict, "WEBHOOK_ENDPOINT_DISABLED")
	ErrWebhookURLNotAllowed     = NewError(http.StatusBadRequest, "WEBHOOK_URL_NOT_ALLOWED")
	ErrWebhookEventTypeUnknown  = NewError(http.StatusBadRequest, "WEBHOOK_EVENT_TYPE_UNKNOWN")
	ErrWebhookDeliveryNotFound  = NewError(http.StatusNotFound, "WEBHOOK_DELIVERY_NOT_FOUND")
	ErrWebhookDeliveryNotFailed = NewError(http.StatusConflict, "WEBHOOK_DELIVERY_NOT_FAILED")
)
