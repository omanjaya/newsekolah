package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
)

// The attendance signal answers "how many of this student's last N school
// days were unexcused absences", the wording the reasons use ("absen 7 dari
// 20 hari sekolah terakhir"). The rules, in one place:
//
//   - Window: the student's latest policy.WindowDays school days up to and
//     including today in the tenant's timezone. Future days are never
//     looked at.
//   - School day: a day the student had scheduled sessions, i.e. attendance
//     reports anything but its "no schedule" status (weekends, holidays and
//     days before enrollment are out). Days are decided per student, so a
//     class that skipped a day does not shorten another class's window.
//   - Unrecorded days (sessions scheduled but not submitted yet, or nothing
//     to summarize) are skipped and do not use up a place in the window: an
//     unknown outcome is neither attendance nor absence, and counting it
//     would dilute the rate.
//   - Absence: only alfa, the unexcused absence. Sick, permission and
//     dispensation days are considered days but not absences: the signal
//     flags truancy, and an excused day is already explained.
//   - ConsideredDays is the number of recorded school days in the window,
//     which is below WindowDays only when the student has fewer recorded
//     days in the lookback (new student, long closure, unsubmitted sessions).

const (
	// lookbackCalendarFactor and lookbackCalendarSlack size the span of
	// calendar days read to find windowDays school days: roughly 1.4 calendar
	// days per school day for a five-day week, doubled to absorb holidays
	// and a multi-week break, plus two weeks.
	lookbackCalendarFactor = 2
	lookbackCalendarSlack  = 14
	// maxLookbackCalendarDays bounds the read for any policy window.
	maxLookbackCalendarDays = 366
)

// localToday is the calendar date of now in loc, as a UTC-midnight date:
// the last day the attendance window may include.
func localToday(now time.Time, loc *time.Location) time.Time {
	year, month, day := now.In(loc).Date()
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

// tenantToday is localToday in the tenant's configured timezone, falling
// back to UTC when it is unset or unrecognized rather than failing the
// recompute over a bad setting (the same fallback attendance uses).
func (s *Service) tenantToday(ctx context.Context, tenantID uuid.UUID, now time.Time) (time.Time, error) {
	name, err := s.repo.GetTenantTimezone(ctx, tenantID)
	if err != nil {
		return time.Time{}, err
	}
	loc := time.UTC
	if name != "" {
		if loaded, err := time.LoadLocation(name); err == nil {
			loc = loaded
		}
	}
	return localToday(now, loc), nil
}

// attendanceLookbackDates lists the calendar dates to read statuses for,
// latest first, starting at today and never after it. It is plain date
// arithmetic, so month lengths cannot repeat or skip a day. The same dates
// apply to every student, so they are decided once and read in one batch.
func attendanceLookbackDates(windowDays int, today time.Time) []time.Time {
	span := min(windowDays*lookbackCalendarFactor+lookbackCalendarSlack, maxLookbackCalendarDays)
	dates := make([]time.Time, span)
	for i := range dates {
		dates[i] = today.AddDate(0, 0, -i)
	}
	return dates
}

// applyAttendance sets, per student, the attendance signal described at the
// top of this file from the statuses read for dates (latest first).
func applyAttendance(signals map[uuid.UUID]domain.Signals, rows []StudentDayStatus, dates []time.Time, windowDays int) {
	byStudent := make(map[uuid.UUID]map[string]DayOutcome, len(signals))
	for _, row := range rows {
		days, ok := byStudent[row.StudentUserID]
		if !ok {
			days = map[string]DayOutcome{}
			byStudent[row.StudentUserID] = days
		}
		days[row.Date.Format("2006-01-02")] = row.Outcome
	}
	for id, current := range signals {
		days := byStudent[id]
		considered, absent := 0, 0
		for _, d := range dates {
			if considered == windowDays {
				break
			}
			switch days[d.Format("2006-01-02")] {
			case DayAbsent:
				considered++
				absent++
			case DayNotAbsent:
				considered++
			}
		}
		if considered > 0 {
			current.HasAttendance = true
			current.ConsideredDays = considered
			current.AbsentDays = absent
			signals[id] = current
		}
	}
}
