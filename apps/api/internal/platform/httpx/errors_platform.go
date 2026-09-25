package httpx

import "net/http"

var (
	ErrPlatformTenancyDisabled = NewError(http.StatusConflict, "PLATFORM_TENANCY_DISABLED")
	ErrPlatformTenantNotFound  = NewError(http.StatusNotFound, "PLATFORM_TENANT_NOT_FOUND")
	ErrPlatformSlugTaken       = NewError(http.StatusConflict, "PLATFORM_SLUG_TAKEN")
	ErrPlatformDomainTaken     = NewError(http.StatusConflict, "PLATFORM_DOMAIN_TAKEN")
	ErrPlatformUnknownModule   = NewError(http.StatusBadRequest, "PLATFORM_UNKNOWN_MODULE")
	ErrPlatformExportNotFound  = NewError(http.StatusNotFound, "PLATFORM_EXPORT_NOT_FOUND")
	ErrPlatformStorageDisabled = NewError(http.StatusConflict, "PLATFORM_STORAGE_DISABLED")

	// ErrPlatformTelegramTokenMissing/ErrPlatformTelegramChatMissing: the
	// caller asked for an action (detect chats, send a test message) that
	// needs a Telegram bot token/chat id already stored, and none is.
	ErrPlatformTelegramTokenMissing = NewError(http.StatusBadRequest, "PLATFORM_TELEGRAM_TOKEN_MISSING")
	ErrPlatformTelegramChatMissing  = NewError(http.StatusBadRequest, "PLATFORM_TELEGRAM_CHAT_MISSING")
	// ErrPlatformTelegramAPIError: Telegram itself rejected the request
	// (invalid token, chat not found, bot blocked, ...). The static
	// message below is what the standard error envelope shows; the
	// operator-alerts test endpoint (which always answers 200) is the one
	// place Telegram's own per-attempt description reaches the caller.
	ErrPlatformTelegramAPIError = NewError(http.StatusBadRequest, "PLATFORM_TELEGRAM_API_ERROR")
	// ErrPlatformTelegramUnreachable: could not reach api.telegram.org at
	// all (network/timeout) -- a dependency failure, not a bad request.
	ErrPlatformTelegramUnreachable = NewError(http.StatusBadGateway, "PLATFORM_TELEGRAM_UNREACHABLE")
)
