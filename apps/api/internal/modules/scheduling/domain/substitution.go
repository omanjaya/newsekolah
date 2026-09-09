package domain

import (
	"time"

	"github.com/google/uuid"
)

type SubstitutionStatus string

const (
	SubstitutionPending   SubstitutionStatus = "pending"
	SubstitutionAccepted  SubstitutionStatus = "accepted"
	SubstitutionRejected  SubstitutionStatus = "rejected"
	SubstitutionCancelled SubstitutionStatus = "cancelled"
)

// Substitution is one teacher-to-teacher request to cover a single dated
// occurrence of a schedule. Accepting it is what grants the substitute
// attendance and journal access for that schedule+date, via AccessChecker.
type Substitution struct {
	ID               uuid.UUID
	TenantID         uuid.UUID
	AcademicYearID   uuid.UUID
	ScheduleID       uuid.UUID
	Date             time.Time
	RequesterUserID  uuid.UUID
	SubstituteUserID uuid.UUID
	Status           SubstitutionStatus
	RequesterNote    string
	ResponseNote     string
	RespondedAt      *time.Time
	CreatedAt        time.Time
}

// ValidateNewSubstitution checks the request-time rules that do not need a
// database round trip: the substitute cannot be the requester, and the
// requested date must actually fall on the schedule's day of week
// (docs/analysis/backend-inventory.md section 1.13). Everything else
// (schedule ownership, substitute-is-a-teacher, no duplicate active
// request) needs a repository lookup and lives in the service.
func ValidateNewSubstitution(requesterUserID, substituteUserID uuid.UUID, scheduleDayOfWeek int16, date time.Time) error {
	if requesterUserID == substituteUserID {
		return ErrSubstituteIsRequester
	}
	if isoWeekday(date) != scheduleDayOfWeek {
		return ErrSubstitutionWeekdayMismatch
	}
	return nil
}

// isoWeekday maps time.Weekday (Sunday=0..Saturday=6) onto the schema's
// day_of_week convention (Monday=1..Sunday=7), matching school_days and
// schedules.day_of_week.
func isoWeekday(t time.Time) int16 {
	w := int16(t.Weekday())
	if w == 0 {
		return 7
	}
	return w
}

// CanRespond reports whether responder may accept/reject this request.
func (s Substitution) CanRespond(responderUserID uuid.UUID) error {
	if s.Status != SubstitutionPending {
		return ErrSubstitutionNotPending
	}
	if responderUserID != s.SubstituteUserID {
		return ErrSubstitutionNotSubstitute
	}
	return nil
}

// CanCancel reports whether canceller may cancel this request: only the
// original requester, and only while it is still pending or accepted (not
// already rejected/cancelled).
func (s Substitution) CanCancel(cancellerUserID uuid.UUID) error {
	if cancellerUserID != s.RequesterUserID {
		return ErrSubstitutionNotRequester
	}
	if s.Status != SubstitutionPending && s.Status != SubstitutionAccepted {
		return ErrSubstitutionAlreadyResponded
	}
	return nil
}

// GrantsAccess reports whether an accepted substitution covers date for
// scheduleID -- the rule attendance.AccessChecker (exported for the
// attendance module to consume) is built on.
func (s Substitution) GrantsAccess(scheduleID uuid.UUID, date time.Time) bool {
	return s.Status == SubstitutionAccepted && s.ScheduleID == scheduleID && sameDate(s.Date, date)
}

func sameDate(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}
