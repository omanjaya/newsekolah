package domain

import "time"

// LatenessInput is everything ComputeLateness needs to derive one day's
// status for one employee. It takes no repository or clock: every value
// the service layer would otherwise fetch (the schedule, whether the
// calendar says this date is a working day, whether permits has an
// approved leave covering it) is resolved by the caller and passed in, so
// this function stays a pure, exhaustively testable rule per
// docs/03-layered-architecture.md section 1's domain-layer boundary.
type LatenessInput struct {
	// Date anchors the expected start/end times; only its calendar date
	// (year/month/day) and location matter.
	Date time.Time
	// Schedule is the employee's expected hours for Date's weekday, or nil
	// if no schedule row exists for that weekday at all -- resolves to
	// StatusUnscheduled, never StatusHoliday: the two look the same to an
	// employee ("nothing recorded"), but mean very different things (no
	// setup done yet, vs. a genuine day off) and must not be conflated.
	Schedule *ScheduleDay
	// IsWorkingDay is the academic calendar's answer for Date (a holiday
	// or a no-school day removes the expectation regardless of Schedule).
	IsWorkingDay bool
	// OnLeave is true when permits has an approved leave request covering
	// Date for this employee; it removes the expectation entirely, taking
	// priority over everything else.
	OnLeave     bool
	ArrivalAt   *time.Time
	DepartureAt *time.Time
}

// LatenessResult is the derived status plus how many minutes late the
// arrival was and how many minutes early the departure was, both zero
// unless the employee was actually expected to work that day.
type LatenessResult struct {
	StatusCode        StatusCode
	LateMinutes       int
	EarlyLeaveMinutes int
}

// ComputeLateness is the single rule every staff attendance view (today's
// board, employee history, monthly recap) uses to turn a raw record into a
// status, so they can never disagree about what a given day looked like.
//
// Resolution order:
//  1. OnLeave always wins: a day off is a day off, whatever the schedule.
//  2. No schedule row at all for this weekday -> Unscheduled: nobody has
//     told the system when this employee is expected to work, which is a
//     configuration gap, not a day off. Must not be reported as a holiday
//     (see this type's Schedule field doc).
//  3. The calendar says it is not a working day, or the employee's own
//     schedule row says this weekday is not one they work -> Holiday: a
//     genuine, intentional "nothing to do today".
//  4. Neither arrival nor departure recorded -> Absent.
//  5. A departure recorded without an arrival -> Incomplete: there is no
//     basis to compute lateness, and this shape signals bad data to review.
//  6. Otherwise, lateness is minutes after the grace period following the
//     expected start; early leave is minutes before the expected end. A
//     shift whose EndMinute <= StartMinute is treated as crossing into the
//     next calendar day, so a night shift's early-morning end is compared
//     correctly against a departure recorded after midnight.
func ComputeLateness(in LatenessInput) LatenessResult {
	if in.OnLeave {
		return LatenessResult{StatusCode: StatusOnLeave}
	}
	if in.Schedule == nil {
		return LatenessResult{StatusCode: StatusUnscheduled}
	}
	if !in.IsWorkingDay || !in.Schedule.IsWorkingDay {
		return LatenessResult{StatusCode: StatusHoliday}
	}
	if in.ArrivalAt == nil && in.DepartureAt == nil {
		return LatenessResult{StatusCode: StatusAbsent}
	}
	if in.ArrivalAt == nil {
		return LatenessResult{StatusCode: StatusIncomplete}
	}

	dayStart := time.Date(in.Date.Year(), in.Date.Month(), in.Date.Day(), 0, 0, 0, 0, in.Date.Location())
	expectedStart := dayStart.Add(time.Duration(in.Schedule.StartMinute) * time.Minute)
	expectedEnd := dayStart.Add(time.Duration(in.Schedule.EndMinute) * time.Minute)
	if in.Schedule.CrossesMidnight() {
		expectedEnd = expectedEnd.Add(24 * time.Hour)
	}
	graceEnd := expectedStart.Add(time.Duration(in.Schedule.GraceMinutes) * time.Minute)

	lateMinutes := 0
	if in.ArrivalAt.After(graceEnd) {
		lateMinutes = int(in.ArrivalAt.Sub(graceEnd) / time.Minute)
	}

	earlyLeaveMinutes := 0
	if in.DepartureAt != nil && in.DepartureAt.Before(expectedEnd) {
		earlyLeaveMinutes = int(expectedEnd.Sub(*in.DepartureAt) / time.Minute)
	}

	status := StatusPresent
	if lateMinutes > 0 {
		status = StatusLate
	}
	return LatenessResult{StatusCode: status, LateMinutes: lateMinutes, EarlyLeaveMinutes: earlyLeaveMinutes}
}
