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
// this function stays a pure comparison.
type SaveWindowInput struct {
	Now time.Time
	// SessionDate is the calendar date the session was held.
	SessionDate time.Time
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
}

// ResolveSaveWindow decides whether a save in the given mode is currently
// allowed, returning a domain error identifying why not.
func ResolveSaveWindow(in SaveWindowInput, mode SaveMode) error {
	switch mode {
	case SaveModeNormal:
		if in.Now.After(in.PeriodEndAt) {
			return ErrSaveWindowClosed
		}
		return nil
	case SaveModeCorrection:
		if !in.IsGlobalCorrector && !in.IsHomeroomOfClass {
			return ErrCorrectionNotAllowed
		}
		deadline := endOfDay(in.SessionDate).AddDate(0, 0, in.CorrectionDays)
		if in.Now.After(deadline) {
			return ErrCorrectionWindowClosed
		}
		return nil
	default:
		return ErrCorrectionNotAllowed
	}
}

func endOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 23, 59, 59, 0, t.Location())
}
