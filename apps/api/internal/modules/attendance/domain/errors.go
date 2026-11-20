package domain

import "errors"

var (
	ErrSessionNotFound = errors.New("attendance session not found")
	ErrEntryNotFound   = errors.New("attendance entry not found")

	ErrNoAccess = errors.New("user has no access to this schedule occurrence")

	ErrInvalidStatusCode = errors.New("status code is not part of the tenant's attendance status policy")

	ErrSaveWindowClosed       = errors.New("the save window for this session has closed (correction deadline passed)")
	ErrCorrectionNotAllowed   = errors.New("user is not permitted to correct attendance for this class")
	ErrCorrectionWindowClosed = errors.New("the correction window for this session has closed")
	// ErrSessionNotStarted refuses attendance for a lesson that has not
	// begun yet (a later date, or a later period today): nothing can be
	// observed about it, and a status recorded ahead of time would flow
	// into homeroom and the reports as real.
	ErrSessionNotStarted = errors.New("the lesson has not started yet")
	// ErrNotSchoolDay refuses a session on a date the academic calendar
	// marks as a holiday, no-school day or semester break for its class.
	ErrNotSchoolDay = errors.New("the session's date is not a school day for its class")

	ErrJournalRequired = errors.New("topic and activities are required to submit this session")

	ErrNoActiveAcademicYear = errors.New("tenant has no active academic year")

	ErrStudentNotInClass = errors.New("student does not belong to this session's class")

	ErrNotHomeroomTeacher = errors.New("user does not hold the homeroom duty for this class")

	ErrCorrectionReasonRequired = errors.New("a reason is required when saving in correction mode")

	ErrInvalidMonth = errors.New("month must be formatted as YYYY-MM")

	// ErrInvalidCorrectionDays refuses a correction window outside
	// [MinCorrectionDays, MaxCorrectionDays].
	ErrInvalidCorrectionDays = errors.New("correction_days is out of range")

	// ErrInvalidScope is a report export's scope selection error: exactly
	// one of class_id or grade_level_id must be given.
	ErrInvalidScope = errors.New("exactly one of class_id or grade_level_id is required")
)
