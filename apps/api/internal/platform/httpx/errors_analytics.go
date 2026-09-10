package httpx

import "net/http"

var (
	ErrAnalyticsNoActiveAcademicYear = NewError(http.StatusConflict, "ANALYTICS_NO_ACTIVE_ACADEMIC_YEAR")
	ErrAnalyticsNotHomeroomTeacher   = NewError(http.StatusForbidden, "ANALYTICS_NOT_HOMEROOM_TEACHER")
	ErrAnalyticsResultNotFound       = NewError(http.StatusNotFound, "ANALYTICS_RESULT_NOT_FOUND")
	ErrAnalyticsInvalidPolicy        = NewError(http.StatusBadRequest, "ANALYTICS_INVALID_POLICY")
)
