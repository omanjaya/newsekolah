package domain

import (
	"time"

	"github.com/google/uuid"
)

// Effective dating. A schedule version is on the timetable on every date
// from EffectiveFrom through EffectiveUntil that falls on its weekday. Both
// bounds are inclusive and stored on that weekday ("snapped"): two versions
// of the same weekday then share a date range only when they share a real
// lesson, so a Thursday lesson that ends on 26 November and another that
// starts on 3 December never clash, whatever dates the admin typed.
//
// A change to a lesson that already has history (a recorded attendance
// session, a substitution request or a supervision visit) takes effect
// from a change date D: the
// old version ends on its last lesson before D and, for an edit, a new
// version starts on its first lesson on or after D. Nothing dated before D
// moves.

// CalendarDate is t's calendar date (read in t's own location) at midnight
// UTC, so dates from a request, a database column and clock.LocalDate all
// compare the same way.
func CalendarDate(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

// IsoWeekday is d's ISO weekday, Monday=1 through Sunday=7, the numbering
// schedules.day_of_week uses.
func IsoWeekday(d time.Time) int16 {
	w := int16(d.Weekday()) //nolint:gosec // Weekday is 0..6
	if w == 0 {
		return 7
	}
	return w
}

// WeekStart is the Monday of d's ISO week.
func WeekStart(d time.Time) time.Time {
	d = CalendarDate(d)
	return d.AddDate(0, 0, -int(IsoWeekday(d)-1))
}

// DateInWeek is the date of weekday dayOfWeek in the week starting
// weekStart (a Monday).
func DateInWeek(weekStart time.Time, dayOfWeek int16) time.Time {
	return CalendarDate(weekStart).AddDate(0, 0, int(dayOfWeek-1))
}

// OnOrAfter is the first date on or after d that falls on dayOfWeek.
func OnOrAfter(d time.Time, dayOfWeek int16) time.Time {
	d = CalendarDate(d)
	return d.AddDate(0, 0, int((dayOfWeek-IsoWeekday(d)+7)%7))
}

// OnOrBefore is the last date on or before d that falls on dayOfWeek.
func OnOrBefore(d time.Time, dayOfWeek int16) time.Time {
	d = CalendarDate(d)
	return d.AddDate(0, 0, -int((IsoWeekday(d)-dayOfWeek+7)%7))
}

// DateRangeContains reports whether d lies within [from, until] as
// calendar dates; a nil until is open-ended.
func DateRangeContains(from time.Time, until *time.Time, d time.Time) bool {
	d = CalendarDate(d)
	if d.Before(CalendarDate(from)) {
		return false
	}
	return until == nil || !d.After(CalendarDate(*until))
}

// SnapRange snaps [from, until] onto dayOfWeek: the first lesson date on or
// after from, and the last on or before until. ok is false when no lesson
// date is left in between.
func SnapRange(dayOfWeek int16, from time.Time, until *time.Time) (start time.Time, end *time.Time, ok bool) {
	start = OnOrAfter(from, dayOfWeek)
	if until == nil {
		return start, nil, true
	}
	last := OnOrBefore(*until, dayOfWeek)
	if last.Before(start) {
		return time.Time{}, nil, false
	}
	return start, &last, true
}

// ResnapForWeekday moves a version's range onto newDay when a correction
// in place changes its weekday. The range only ever shrinks: the new start
// is the first newDay on or after the old start, and the new end the last
// newDay on or before the old end, so the corrected version never takes
// over a date before it started (a week an earlier version still covers,
// or one already past) nor after it ended (a week a later version covers).
// The one exception is a version that started with its year (on or before
// oldDay's first date of the year): it starts with the year on the new
// weekday too, so a whole-year lesson stays a whole-year lesson. ok is
// false when no lesson date is left.
func ResnapForWeekday(from time.Time, until *time.Time, oldDay, newDay int16, yearStart time.Time) (start time.Time, end *time.Time, ok bool) {
	start = OnOrAfter(from, newDay)
	if !CalendarDate(from).After(OnOrAfter(yearStart, oldDay)) {
		start = OnOrAfter(yearStart, newDay)
	}
	if until == nil {
		return start, nil, true
	}
	last := OnOrBefore(*until, newDay)
	if last.Before(start) {
		return time.Time{}, nil, false
	}
	return start, &last, true
}

// History is what binds a schedule version: Until is the latest date of a
// recorded attendance session, a pending/accepted substitution request or
// a supervision visit, nil when its history is only rejected or cancelled
// requests (which still make it history, and so keep it from being
// rewritten in place or deleted, but bind no date).
type History struct {
	ScheduleID uuid.UUID
	Until      *time.Time
}

// LessonBegun reports whether s's lesson today has already begun at now
// (the school's wall clock): s is in effect today, today falls on its
// weekday, and startsAt (the time of day its first period starts; the date
// part is ignored) is at or before now's time of day. A lesson under way
// or already taught belongs to the version it was taught as, whether or
// not anyone recorded it yet.
func LessonBegun(s Schedule, today, now, startsAt time.Time) bool {
	if IsoWeekday(today) != s.DayOfWeek || !s.EffectiveOn(today) {
		return false
	}
	return clockOf(startsAt) <= clockOf(now)
}

// clockOf is t's time of day as a duration since midnight.
func clockOf(t time.Time) time.Duration {
	h, m, sec := t.Clock()
	return time.Duration(h)*time.Hour + time.Duration(m)*time.Minute + time.Duration(sec)*time.Second
}

// ChangeFloor is the first date any change to a version may take effect
// from: today, or tomorrow once today's lesson of the version has begun
// (LessonBegun), so a change never moves a lesson already taught today.
func ChangeFloor(today time.Time, begunToday bool) time.Time {
	floor := CalendarDate(today)
	if begunToday {
		return floor.AddDate(0, 0, 1)
	}
	return floor
}

// EarliestChange is the first date a change to version s may take effect
// from: never before floor (ChangeFloor). A version with history h is in
// addition never changed on or before a date h binds, nor before its own
// first lesson has passed: it then always keeps a lesson date and is ended
// (ChangeRetire), never removed, so every record pointing at it keeps its
// row (a cancelled substitution request, too, which binds no date).
func EarliestChange(floor time.Time, s Schedule, h *History) time.Time {
	earliest := CalendarDate(floor)
	if h == nil {
		return earliest
	}
	earliest = LaterDate(earliest, OnOrAfter(s.EffectiveFrom, s.DayOfWeek).AddDate(0, 0, 1))
	if h.Until != nil {
		earliest = LaterDate(earliest, CalendarDate(*h.Until).AddDate(0, 0, 1))
	}
	return earliest
}

// LaterDate is the later of a and b.
func LaterDate(a, b time.Time) time.Time {
	if b.After(a) {
		return b
	}
	return a
}

// ChangeKind is what a change from date D does to one existing version.
type ChangeKind int

const (
	// ChangeRetire ends the version on its last lesson before D.
	ChangeRetire ChangeKind = iota + 1
	// ChangeDrop removes the version outright: it has no lesson before D.
	// A version with history never gets here (EarliestChange keeps D after
	// its first lesson), so nothing points at a dropped version.
	ChangeDrop
)

// ChangePlan is PlanChange's verdict for one version.
type ChangePlan struct {
	Kind ChangeKind
	// Until is the version's new last date, for ChangeRetire.
	Until time.Time
}

// PlanChange decides what a change taking effect on d does to s. A version
// that already ended before d cannot change (ErrScheduleEnded).
func PlanChange(s Schedule, d time.Time) (ChangePlan, error) {
	d = CalendarDate(d)
	if s.EffectiveUntil != nil && CalendarDate(*s.EffectiveUntil).Before(d) {
		return ChangePlan{}, ErrScheduleEnded
	}
	last := OnOrBefore(d.AddDate(0, 0, -1), s.DayOfWeek)
	if last.Before(CalendarDate(s.EffectiveFrom)) {
		return ChangePlan{Kind: ChangeDrop}, nil
	}
	return ChangePlan{Kind: ChangeRetire, Until: last}, nil
}
