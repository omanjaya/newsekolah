package domain

import "time"

// SaveMode distinguishes an ordinary same-day save from an explicit
// correction, per docs/analysis/backend-inventory.md section 1.9
// ("?mode=correction|koreksi"): the two have different time windows and a
// correction is additionally recorded in attendance_corrections.
type SaveMode string

const (
	SaveModeNormal     SaveMode = "normal"
	SaveModeCorrection SaveMode = "correction"
)

// SaveWindowInput carries everything ResolveSaveWindow needs to decide
// whether a save is allowed, already resolved to concrete instants by the
// service (tenant timezone, period end time, correction_days setting) so
// this function stays a pure comparison. Now must already be in the
// tenant's time zone: the session's calendar date is read in that zone,
// whatever location SessionDate itself carries (a Postgres DATE arrives
// as midnight UTC).
type SaveWindowInput struct {
	Now time.Time
	// SessionDate is the calendar date the session was held.
	SessionDate time.Time
	// PeriodStartAt is the wall-clock instant the session's first period
	// starts on SessionDate. Nothing may be saved before it, in either
	// mode. The zero value sets no lower bound.
	PeriodStartAt time.Time
	// PeriodEndAt is the wall-clock instant the session's last period
	// ends on SessionDate, plus the tenant's configured grace period
	// already added in.
	PeriodEndAt time.Time
	// CorrectionDays is the tenant policy attendance.correction_days: how
	// many days after SessionDate a correction is still allowed.
	CorrectionDays int
	// IsGlobalCorrector is true for a user holding correct_attendance or
	// an all-classes reporting duty; IsHomeroomOfClass is true for the
	// homeroom teacher of the session's class. Per
	// docs/analysis/backend-inventory.md section 1.9, only these two may
	// use SaveModeCorrection at all.
	IsGlobalCorrector bool
	IsHomeroomOfClass bool
	// IsScheduleOwner is true for the session's own teacher or an accepted
	// substitute for this occurrence -- whoever already passed the
	// per-schedule access check for a normal-mode save. Per the old
	// system's requireAttendanceSaveAccess (teacher_attendance.go
	// L939-970), this actor keeps saving in normal mode past the period
	// end, without needing correct_attendance or a reason, until the same
	// correction deadline a global corrector or homeroom teacher gets.
	IsScheduleOwner bool
}

// ResolveSaveWindow decides whether a save in the given mode is currently
// allowed, returning a domain error identifying why not.
func ResolveSaveWindow(in SaveWindowInput, mode SaveMode) error {
	if SessionNotStarted(in.SessionDate, in.Now) || in.Now.Before(in.PeriodStartAt) {
		return ErrSessionNotStarted
	}
	until, allowed := EditableUntil(in, mode)
	switch {
	case !allowed:
		return ErrCorrectionNotAllowed
	case !in.Now.After(until):
		return nil
	case mode == SaveModeCorrection:
		return ErrCorrectionWindowClosed
	default:
		return ErrSaveWindowClosed
	}
}

// EditableUntil is the last instant a save in mode is allowed for the
// viewer in described, so the editor can say up front that a session is
// locked instead of letting a teacher fill a roster the save will refuse.
// allowed is false when the viewer may not save in that mode at all (a
// correction by someone who is neither a global corrector nor the class's
// homeroom teacher).
//
// A normal-mode save closes at the period end; the session's own teacher
// keeps saving until the correction deadline when that is later. A
// correction closes at the correction deadline.
func EditableUntil(in SaveWindowInput, mode SaveMode) (until time.Time, allowed bool) {
	deadline := CorrectionDeadline(in.SessionDate, in.CorrectionDays, in.Now.Location())
	switch mode {
	case SaveModeNormal:
		if in.IsScheduleOwner && deadline.After(in.PeriodEndAt) {
			return deadline, true
		}
		return in.PeriodEndAt, true
	case SaveModeCorrection:
		if !in.IsGlobalCorrector && !in.IsHomeroomOfClass {
			return time.Time{}, false
		}
		return deadline, true
	default:
		return time.Time{}, false
	}
}

// SessionNotStarted reports whether sessionDate's calendar date lies after
// now's, both read as wall-clock dates (now already in the tenant's zone).
// Attendance is never recorded ahead of the day, in any save mode.
func SessionNotStarted(sessionDate, now time.Time) bool {
	sy, sm, sd := sessionDate.Date()
	ny, nm, nd := now.Date()
	return time.Date(sy, sm, sd, 0, 0, 0, 0, time.UTC).After(time.Date(ny, nm, nd, 0, 0, 0, 0, time.UTC))
}

// CorrectionDeadline is the last second of the day correctionDays after
// sessionDate's calendar date, on the wall clock of loc (the tenant's time
// zone). The date is read from sessionDate's own fields, not converted, so
// a DATE column scanned as midnight UTC still names the right day.
func CorrectionDeadline(sessionDate time.Time, correctionDays int, loc *time.Location) time.Time {
	y, m, d := sessionDate.Date()
	return time.Date(y, m, d+correctionDays, 23, 59, 59, 0, loc)
}
