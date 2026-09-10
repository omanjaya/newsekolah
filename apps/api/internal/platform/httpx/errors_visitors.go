package httpx

import "net/http"

var (
	ErrExpectedGuestNotFound  = NewError(http.StatusNotFound, "EXPECTED_GUEST_NOT_FOUND")
	ErrExpectedGuestResolved  = NewError(http.StatusConflict, "EXPECTED_GUEST_RESOLVED")
	ErrVisitNotFound          = NewError(http.StatusNotFound, "VISIT_NOT_FOUND")
	ErrVisitAlreadyCheckedOut = NewError(http.StatusConflict, "VISIT_ALREADY_CHECKED_OUT")
	ErrIncidentNotFound       = NewError(http.StatusNotFound, "INCIDENT_NOT_FOUND")
	ErrIncidentAlreadyClosed  = NewError(http.StatusConflict, "INCIDENT_ALREADY_CLOSED")
	ErrIncidentForbidden      = NewError(http.StatusForbidden, "INCIDENT_FORBIDDEN")
	ErrVisitorsModuleDisabled = NewError(http.StatusForbidden, "VISITORS_MODULE_DISABLED")
)
