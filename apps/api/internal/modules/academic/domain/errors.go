package domain

import "errors"

var (
	ErrAcademicYearNotFound   = errors.New("academic year not found")
	ErrAcademicYearNameExists = errors.New("academic year label already exists")
	ErrAcademicYearArchived   = errors.New("academic year is archived")
	ErrInvalidPeriod          = errors.New("ends_on must be after starts_on")

	ErrTermNotFound      = errors.New("term not found")
	ErrTermSequenceTaken = errors.New("term sequence already used in this academic year")

	ErrCalendarEventNotFound     = errors.New("calendar event not found")
	ErrInvalidCalendarEventRange = errors.New("end_date must not be before date")

	ErrNewYearSourceNotFound = errors.New("source academic year not found")
	ErrNewYearSameAsSource   = errors.New("destination academic year must differ from the source year")

	ErrGradeLevelNotFound   = errors.New("grade level not found")
	ErrGradeLevelCodeExists = errors.New("grade level code already exists")
	ErrTrackNotFound        = errors.New("track not found")
	ErrTrackCodeExists      = errors.New("track code already exists")
	ErrUnknownTemplate      = errors.New("unknown grade level template")

	ErrClassNotFound     = errors.New("class not found")
	ErrClassNameExists   = errors.New("class name already exists in this academic year")
	ErrHasDependents     = errors.New("record has dependents and cannot be deleted")
	ErrEnrollmentExists  = errors.New("student already has an active enrollment this academic year")
	ErrEnrollmentNotOpen = errors.New("enrollment is not active")
	ErrStudentNotActive  = errors.New("user is not an active student")

	ErrSubjectNotFound       = errors.New("subject not found")
	ErrSubjectCodeExists     = errors.New("subject code already exists")
	ErrRoomNotFound          = errors.New("room not found")
	ErrRoomCodeExists        = errors.New("room code already exists")
	ErrSubjectOfferingExists = errors.New("subject offering already exists for this year and grade level")

	ErrPeriodTemplateNotFound = errors.New("period template not found")
	ErrPeriodNotFound         = errors.New("period not found")
	ErrPeriodSequenceTaken    = errors.New("period sequence already used in this template")
	ErrInvalidDayOfWeek       = errors.New("day_of_week must be between 1 and 7")

	ErrTeachingAssignmentNotFound = errors.New("teaching assignment not found")
	ErrTeachingAssignmentExists   = errors.New("teacher already assigned to this subject and class")
	ErrTeacherNotAssigned         = errors.New("teacher has no teaching assignment for this subject and class")
	ErrTeacherNotActive           = errors.New("user is not an active teacher")
	ErrSubjectNotOfferedInYear    = errors.New("subject has no offering in this academic year")
	ErrClassYearMismatch          = errors.New("class does not belong to this academic year")
	ErrTooManyClasses             = errors.New("at most 100 classes are allowed in one teaching assignment sync")

	ErrImportRowInvalid    = errors.New("import row could not be matched to a student")
	ErrImportHasInvalidRow = errors.New("the file has at least one invalid row; commit with partial=true to apply the valid rows and skip the rest")
)
