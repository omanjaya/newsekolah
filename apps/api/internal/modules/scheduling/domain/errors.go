package domain

import (
	"errors"
	"fmt"
	"time"
)

var (
	ErrScheduleHasHistory   = errors.New("schedule has attendance or substitution history")
	ErrInvalidScheduleBlock = errors.New("schedule IDs must describe one contiguous block")
	ErrScheduleNotFound     = errors.New("schedule not found")
	ErrInvalidPeriodRange   = errors.New("end period must not be before the start period")
	ErrDayNotSchoolDay      = errors.New("day of week is not an active school day")
	ErrTeacherNotAssigned   = errors.New("teacher has no active teaching assignment for this class and subject")
	ErrPeriodNotFound       = errors.New("period not found in the school's period template")
	ErrPeriodIsBreak        = errors.New("a break period cannot be scheduled as a lesson")
	ErrPeriodTemplateDay    = errors.New("period does not belong to the template assigned to this day of week")
	ErrYearArchived         = errors.New("academic year is archived")

	// Effective dating (effective.go).
	ErrScheduleEnded               = errors.New("the lesson is no longer on the timetable from that date")
	ErrEffectiveFromOutOfYear      = errors.New("the effective date lies outside the academic year")
	ErrEffectiveDateAdminOnly      = errors.New("only a schedule manager may date a change")
	ErrScheduleChangeBeforeHistory = errors.New("the change would take effect on or before a date the lesson already has history for")

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
	ErrSubstitutionDateInPast       = errors.New("the requested date has already passed")
	ErrSubstitutionNotSchoolDay     = errors.New("the requested date is a holiday or has no lessons")
	ErrSubstitutionDuplicateActive  = errors.New("a pending or accepted substitution already exists for this schedule and date")
	ErrSubstitutionNotPending       = errors.New("substitution request is no longer pending")
	ErrSubstitutionNotRequester     = errors.New("only the requester may perform this action")
	ErrSubstitutionNotSubstitute    = errors.New("only the invited substitute may respond to this request")
	ErrSubstitutionAlreadyResponded = errors.New("substitution request has already been responded to")
	ErrSubstitutionScheduleMismatch = errors.New("substitution request does not belong to the given schedule")
	ErrSubstitutionNotScheduled     = errors.New("the lesson is not on the timetable on that date")

	ErrJournalNotFound        = errors.New("class journal not found")
	ErrJournalNotOwner        = errors.New("only the teaching teacher may write this journal")
	ErrJournalDuplicate       = errors.New("a journal already exists for this teacher, class, subject, and date")
	ErrJournalMissingTopic    = errors.New("topic is required")
	ErrJournalMissingActivity = errors.New("activities is required")
)

// HistoryRequiresDateError is ErrScheduleHasHistory for a change sent
// without a date: Min is the earliest date the same change may take effect
// from, so the caller can offer it, and HeldBy the record that pushes it
// out, when one does (ChangeWindow).
type HistoryRequiresDateError struct {
	Min    time.Time
	HeldBy *Hold
}

func (e *HistoryRequiresDateError) Error() string {
	return fmt.Sprintf("%s: date the change from %s or later", ErrScheduleHasHistory, e.Min.Format(time.DateOnly))
}

func (e *HistoryRequiresDateError) Unwrap() error { return ErrScheduleHasHistory }

// ChangeTooEarlyError is ErrScheduleChangeBeforeHistory naming the earliest
// date the change may take effect from instead, and the record that holds
// it there, when one does (ChangeWindow).
type ChangeTooEarlyError struct {
	Min    time.Time
	HeldBy *Hold
}

func (e *ChangeTooEarlyError) Error() string {
	return fmt.Sprintf("%s: earliest %s", ErrScheduleChangeBeforeHistory, e.Min.Format(time.DateOnly))
}

func (e *ChangeTooEarlyError) Unwrap() error { return ErrScheduleChangeBeforeHistory }
