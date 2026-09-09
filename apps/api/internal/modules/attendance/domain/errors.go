package domain

import "errors"

var (
	ErrSessionNotFound = errors.New("attendance session not found")
	ErrEntryNotFound   = errors.New("attendance entry not found")

	ErrNoAccess = errors.New("user has no access to this schedule occurrence")

	ErrInvalidStatusCode = errors.New("status code is not part of the tenant's attendance status policy")

	ErrSaveWindowClosed       = errors.New("the same-day save window for this session has closed")
	ErrCorrectionNotAllowed   = errors.New("user is not permitted to correct attendance for this class")
	ErrCorrectionWindowClosed = errors.New("the correction window for this session has closed")

	ErrJournalRequired = errors.New("topic and activities are required to submit this session")

	ErrNoActiveAcademicYear = errors.New("tenant has no active academic year")

	ErrStudentNotInClass = errors.New("student does not belong to this session's class")

	ErrNotHomeroomTeacher = errors.New("user does not hold the homeroom duty for this class")

	ErrCorrectionReasonRequired = errors.New("a reason is required when saving in correction mode")

	ErrInvalidMonth = errors.New("month must be formatted as YYYY-MM")
)
