package domain

import "errors"

var (
	ErrScheduleNotFound   = errors.New("schedule not found")
	ErrInvalidPeriodRange = errors.New("end period must not be before the start period")
	ErrDayNotSchoolDay    = errors.New("day of week is not an active school day")
	ErrTeacherNotAssigned = errors.New("teacher has no active teaching assignment for this class and subject")
	ErrPeriodNotFound     = errors.New("period not found in the school's period template")

	// ErrConflictClass and ErrConflictTeacher map to HTTP 409
	// SCHEDULE_CONFLICT_CLASS / SCHEDULE_CONFLICT_TEACHER in transport,
	// whether the domain-level DetectConflict caught it first or a
	// database exclusion constraint violation surfaced it (the two must
	// agree, since the constraint is the last line of defense against a
	// race the domain check alone cannot close).
	ErrConflictClass   = errors.New("class already has a schedule overlapping this day and period range")
	ErrConflictTeacher = errors.New("teacher already has a schedule overlapping this day and period range")

	ErrTeacherEditForbidden = errors.New("only the schedule's own teacher may edit a teacher-sourced schedule")
	ErrTeacherEditDeadline  = errors.New("the teacher self-service edit window for this schedule has closed")
	ErrAdminOnlySource      = errors.New("only an admin may set this schedule's source")

	ErrSubstitutionNotFound         = errors.New("substitution request not found")
	ErrSubstituteIsRequester        = errors.New("the substitute cannot be the requesting teacher")
	ErrSubstituteNotTeacher         = errors.New("the substitute must be an active teacher")
	ErrSubstitutionWeekdayMismatch  = errors.New("the requested date does not fall on the schedule's day of week")
	ErrSubstitutionDuplicateActive  = errors.New("a pending or accepted substitution already exists for this schedule and date")
	ErrSubstitutionNotPending       = errors.New("substitution request is no longer pending")
	ErrSubstitutionNotRequester     = errors.New("only the requester may perform this action")
	ErrSubstitutionNotSubstitute    = errors.New("only the invited substitute may respond to this request")
	ErrSubstitutionAlreadyResponded = errors.New("substitution request has already been responded to")
	ErrSubstitutionScheduleMismatch = errors.New("substitution request does not belong to the given schedule")

	ErrJournalNotFound        = errors.New("class journal not found")
	ErrJournalNotOwner        = errors.New("only the teaching teacher may write this journal")
	ErrJournalDuplicate       = errors.New("a journal already exists for this teacher, class, subject, and date")
	ErrJournalMissingTopic    = errors.New("topic is required")
	ErrJournalMissingActivity = errors.New("activities is required")
)
