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
)
