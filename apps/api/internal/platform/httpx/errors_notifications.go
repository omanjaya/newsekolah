package httpx

import "net/http"

// Error codes owned by the notifications and announcements modules. Kept in
// their own file (rather than appended to errors.go) so parallel modules
// adding their own domain errors never touch the same lines.
var (
	ErrNotificationNotFound = NewError(http.StatusNotFound, "NOTIFICATION_NOT_FOUND")
	ErrPushDeviceNotFound   = NewError(http.StatusNotFound, "PUSH_DEVICE_NOT_FOUND")

	ErrAnnouncementNotFound      = NewError(http.StatusNotFound, "ANNOUNCEMENT_NOT_FOUND")
	ErrAnnouncementInvalidState  = NewError(http.StatusConflict, "ANNOUNCEMENT_INVALID_STATUS")
	ErrAnnouncementAudienceEmpty = NewError(http.StatusBadRequest, "ANNOUNCEMENT_AUDIENCE_EMPTY")

	ErrWhatsAppTemplateNotFound = NewError(http.StatusNotFound, "WHATSAPP_TEMPLATE_NOT_FOUND")
	ErrWhatsAppTemplateExists   = NewError(http.StatusConflict, "WHATSAPP_TEMPLATE_EXISTS")
	ErrWhatsAppProviderNotFound = NewError(http.StatusNotFound, "WHATSAPP_PROVIDER_NOT_FOUND")
	ErrWhatsAppDeliveryNotFound = NewError(http.StatusNotFound, "WHATSAPP_DELIVERY_NOT_FOUND")
)
