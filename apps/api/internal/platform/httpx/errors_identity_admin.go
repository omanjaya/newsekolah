package httpx

import "net/http"

// Errors added by the identity module's administration features. Declared
// in their own file, alongside the base set in errors.go, so ownership of
// this addition stays clear.
var (
	ErrUserAlreadyExists                = NewError(http.StatusConflict, "USER_ALREADY_EXISTS")
	ErrUserCannotArchiveSelf            = NewError(http.StatusBadRequest, "USER_CANNOT_ARCHIVE_SELF")
	ErrOnlySuperAdminCanGrantSuperAdmin = NewError(http.StatusForbidden, "ONLY_SUPER_ADMIN_CAN_GRANT_SUPER_ADMIN")
	ErrRoleSystemImmutable              = NewError(http.StatusBadRequest, "ROLE_SYSTEM_IMMUTABLE")
	ErrRoleInUse                        = NewError(http.StatusConflict, "ROLE_IN_USE")
	ErrUnknownPermission                = NewError(http.StatusBadRequest, "UNKNOWN_PERMISSION")
	ErrDutyTypeInUse                    = NewError(http.StatusConflict, "DUTY_TYPE_IN_USE")
	ErrDutyTypeExists                   = NewError(http.StatusConflict, "DUTY_TYPE_ALREADY_EXISTS")
	ErrImpersonationNotAllowed          = NewError(http.StatusForbidden, "IMPERSONATION_NOT_ALLOWED")
	ErrNotImpersonating                 = NewError(http.StatusBadRequest, "NOT_IMPERSONATING")
	ErrPasswordResetTokenInvalid        = NewError(http.StatusBadRequest, "PASSWORD_RESET_TOKEN_INVALID")
	ErrUploadInvalidFileType            = NewError(http.StatusBadRequest, "UPLOAD_INVALID_FILE_TYPE")
	ErrUploadFileTooLarge               = NewError(http.StatusBadRequest, "UPLOAD_FILE_TOO_LARGE")
	ErrUploadNotConfigured              = NewError(http.StatusServiceUnavailable, "UPLOAD_NOT_CONFIGURED")
	ErrImportFileInvalid                = NewError(http.StatusBadRequest, "IMPORT_FILE_INVALID")
	ErrPrimaryRoleNotSystem             = NewError(http.StatusBadRequest, "PRIMARY_ROLE_NOT_SYSTEM")
	ErrAdditionalRoleSystem             = NewError(http.StatusBadRequest, "ADDITIONAL_ROLE_MUST_BE_CUSTOM")
	ErrLeavePermissionDirect            = NewError(http.StatusBadRequest, "LEAVE_PERMISSION_REQUIRES_DUTY")
	ErrImpersonationNested              = NewError(http.StatusForbidden, "IMPERSONATION_NESTED_NOT_ALLOWED")
	ErrOriginNotAllowed                 = NewError(http.StatusForbidden, "ORIGIN_NOT_ALLOWED")
	ErrPushEndpointNotAllowed           = NewError(http.StatusBadRequest, "PUSH_ENDPOINT_NOT_ALLOWED")
	ErrApnsNotConfigured                = NewError(http.StatusServiceUnavailable, "APNS_NOT_CONFIGURED")
	ErrImportTooManyRows                = NewError(http.StatusBadRequest, "IMPORT_TOO_MANY_ROWS")
)
