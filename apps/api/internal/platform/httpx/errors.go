// Package httpx wires the chi router, standard middleware, and the single
// place where domain errors become HTTP responses. Handlers never write an
// ad hoc error body; they return a *Error (or a domain error mapped to one).
package httpx

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/i18n"
)

// Error is a domain-facing error carrying a stable machine code and the
// HTTP status it maps to. Handlers construct these directly for input
// validation, or map a domain sentinel error to one via WriteError.
type Error struct {
	Status  int
	Code    string
	Details []ErrorDetail
	cause   error
}

type ErrorDetail struct {
	Field   string `json:"field"`
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

func (e *Error) Error() string {
	if e.cause != nil {
		return e.Code + ": " + e.cause.Error()
	}
	return e.Code
}

func (e *Error) Unwrap() error { return e.cause }

func NewError(status int, code string) *Error {
	return &Error{Status: status, Code: code}
}

func WrapError(status int, code string, cause error) *Error {
	return &Error{Status: status, Code: code, cause: cause}
}

// Internal wraps an unexpected error so the 500 envelope stays generic
// while the cause still reaches the response error handler's log line.
func Internal(cause error) *Error {
	return WrapError(http.StatusInternalServerError, "INTERNAL_ERROR", cause)
}

// WithDetails returns a copy carrying the field-level details, leaving the
// receiver untouched. The package-level sentinels below are shared by every
// module, and several error maps are built at init time, so mutating the
// receiver would pin one module's details onto every validation error the
// API returns.
func (e *Error) WithDetails(details ...ErrorDetail) *Error {
	clone := *e
	clone.Details = details
	return &clone
}

var (
	ErrValidation     = NewError(http.StatusBadRequest, "VALIDATION_FAILED")
	ErrInvalidCreds   = NewError(http.StatusUnauthorized, "AUTH_INVALID_CREDENTIALS")
	ErrTokenExpired   = NewError(http.StatusUnauthorized, "AUTH_TOKEN_EXPIRED")
	ErrTokenInvalid   = NewError(http.StatusUnauthorized, "AUTH_TOKEN_INVALID")
	ErrSessionRevoked = NewError(http.StatusUnauthorized, "AUTH_SESSION_REVOKED")
	ErrTenantNotFound = NewError(http.StatusNotFound, "TENANT_NOT_FOUND")
	ErrRateLimited    = NewError(http.StatusTooManyRequests, "RATE_LIMITED")
	ErrForbidden      = NewError(http.StatusForbidden, "FORBIDDEN")
	ErrNotFound       = NewError(http.StatusNotFound, "NOT_FOUND")
	ErrInternal       = NewError(http.StatusInternalServerError, "INTERNAL_ERROR")
)

type errorEnvelope struct {
	Error struct {
		Code      string        `json:"code"`
		Message   string        `json:"message"`
		Details   []ErrorDetail `json:"details,omitempty"`
		RequestID string        `json:"request_id,omitempty"`
	} `json:"error"`
}

// WriteError renders err as the standard {error:{code,message,details,request_id}}
// envelope. A plain error (not *Error) is treated as an unexpected internal
// error and logged by the caller before this is reached.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	var appErr *Error
	if !errors.As(err, &appErr) {
		appErr = ErrInternal
	}

	acceptLanguage := r.Header.Get("Accept-Language")
	env := errorEnvelope{}
	env.Error.Code = appErr.Code
	env.Error.Message = i18n.Message(appErr.Code, acceptLanguage)
	env.Error.Details = appErr.Details
	env.Error.RequestID = RequestIDFromContext(r.Context())

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(appErr.Status)
	_ = json.NewEncoder(w).Encode(env)
}

// WriteJSON writes v as a JSON response body with the given status code.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
