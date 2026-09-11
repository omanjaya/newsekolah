package domain

import "errors"

var (
	ErrNotificationNotFound = errors.New("notification not found")
	ErrPushDeviceNotFound   = errors.New("push device not found")
	ErrInvalidChannel       = errors.New("invalid notification channel")
	ErrInvalidPlatform      = errors.New("invalid push device platform")
	ErrInvalidPushEndpoint  = errors.New("web push endpoint is not https or not on an allowed provider host")
	ErrDeviceTokenTooLong   = errors.New("device token exceeds 255 characters")
	ErrApnsNotConfigured    = errors.New("apns is not configured on this server")
	// ErrPushDeviceRegistrationConflict is a concurrent registration of the
	// same endpoint under two tenants racing the other-tenant cleanup in
	// RegisterPushDevice (see push_devices.go); the client should retry.
	ErrPushDeviceRegistrationConflict = errors.New("push device registration conflict, retry")

	ErrMissingTemplateVariable  = errors.New("missing template variable")
	ErrWhatsAppTemplateNotFound = errors.New("whatsapp template not found")
	ErrWhatsAppTemplateExists   = errors.New("whatsapp template name already exists")
	ErrWhatsAppProviderNotFound = errors.New("whatsapp provider not configured")
	ErrInvalidWhatsAppProvider  = errors.New("invalid whatsapp provider")
	ErrWhatsAppDeliveryNotFound = errors.New("whatsapp delivery not found")
	ErrInvalidWebhookSignature  = errors.New("invalid webhook signature")
)
