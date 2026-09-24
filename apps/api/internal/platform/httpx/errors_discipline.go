package httpx

import "net/http"

var (
	ErrViolationTypeNotFound   = NewError(http.StatusNotFound, "VIOLATION_TYPE_NOT_FOUND")
	ErrViolationTypeCodeExists = NewError(http.StatusConflict, "VIOLATION_TYPE_CODE_EXISTS")
	ErrViolationTypeInactive   = NewError(http.StatusConflict, "VIOLATION_TYPE_INACTIVE")
	ErrViolationRecordNotFound = NewError(http.StatusNotFound, "VIOLATION_RECORD_NOT_FOUND")
	ErrViolationRecordVoided   = NewError(http.StatusConflict, "VIOLATION_RECORD_VOIDED")
	ErrWarningLetterNotFound   = NewError(http.StatusNotFound, "WARNING_LETTER_NOT_FOUND")
	ErrWarningLetterNotDue     = NewError(http.StatusConflict, "WARNING_LETTER_NOT_DUE")
	ErrWarningLetterIssued     = NewError(http.StatusConflict, "WARNING_LETTER_ALREADY_ISSUED")
	ErrCounselingNotFound      = NewError(http.StatusNotFound, "COUNSELING_NOT_FOUND")
	ErrCounselingForbidden     = NewError(http.StatusForbidden, "COUNSELING_FORBIDDEN")
	ErrStudentNotEnrolled      = NewError(http.StatusConflict, "STUDENT_NOT_ENROLLED")
	ErrStudentInactive         = NewError(http.StatusConflict, "STUDENT_INACTIVE")
	ErrAttachmentNotFound      = NewError(http.StatusNotFound, "ATTACHMENT_NOT_FOUND")
	ErrAttachmentTooLarge      = NewError(http.StatusBadRequest, "ATTACHMENT_TOO_LARGE")
	ErrAttachmentInvalidType   = NewError(http.StatusBadRequest, "ATTACHMENT_INVALID_TYPE")
	ErrAttachmentLimitReached  = NewError(http.StatusConflict, "ATTACHMENT_LIMIT_REACHED")
	ErrReportUnavailable       = NewError(http.StatusServiceUnavailable, "REPORT_UNAVAILABLE")
)
