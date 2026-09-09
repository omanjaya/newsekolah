package httpx

import "net/http"

var (
	ErrMfaNotAvailable = NewError(http.StatusConflict, "MFA_NOT_AVAILABLE")
	ErrMfaNotEnrolled  = NewError(http.StatusConflict, "MFA_NOT_ENROLLED")
	ErrMfaInvalidCode  = NewError(http.StatusBadRequest, "MFA_INVALID_CODE")
	// ErrMfaRequired tells the login screen to ask for the second factor
	// and retry with the same credentials plus an otp.
	ErrMfaRequired = NewError(http.StatusUnauthorized, "MFA_REQUIRED")
)
