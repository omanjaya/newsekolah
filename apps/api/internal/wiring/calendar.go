package wiring

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
)

// ClassCalendar exposes the academic module's calendar (weekly pattern
// plus holidays, no-school days, and semester breaks) to modules that
// reason about one class's dated lessons -- attendance (may a session be
// opened on this date) and scheduling (may a substitute be requested for
// it) -- so "is there school that day" always accounts for the real
// calendar instead of only the weekly pattern. The class's grade level
// scopes the check, so an event aimed at one grade level only blocks that
// grade. Constructed here rather than those modules importing the academic
// module directly, per docs/03-layered-architecture.md section 1.
//
// A school day is a teaching day for a class only when the class's
// timetable has a lesson on that weekday: a school whose week is active on
// Saturday still gives a class timetabled Tuesday and Friday no lessons on
// Saturday, so a leave letter over that weekend is not counted as a day of
// leave (attendance) or a school day of the request (permits).
type ClassCalendar struct {
	Calendar academic.CalendarReader
	Classes  academic.ClassReader
	// Schedules reads the class timetables. Nil leaves the timetable out
	// and answers from the academic calendar alone.
	Schedules ClassTimetable
}

// ClassTimetable counts a class's scheduled lessons per ISO weekday
// (scheduling.ScheduleReader satisfies it).
type ClassTimetable interface {
	CountSchedulesForClassDay(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, dayOfWeek int16) (int64, error)
	CountSchedulesByClassDay(ctx context.Context, tenantID, academicYearID uuid.UUID, classIDs []uuid.UUID) ([]scheduling.ClassDayCount, error)
}

// IsTeachingDay reports whether classID has lessons on date and, when it
// does not, names the calendar event responsible (empty for an ordinary
// non-school weekday or a weekday the class has no lessons on).
func (c ClassCalendar) IsTeachingDay(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, date time.Time) (bool, string, error) {
	class, err := c.Classes.GetClass(ctx, tenantID, classID)
	if err != nil {
		return false, "", err
	}
	gradeLevelID := class.GradeLevelID
	teaching, err := c.Calendar.IsSchoolDay(ctx, tenantID, academicYearID, date, &gradeLevelID)
	if err != nil {
		return false, "", err
	}
	if !teaching {
		name, _, err := c.Calendar.NonTeachingEventName(ctx, tenantID, academicYearID, date, &gradeLevelID)
		return false, name, err
	}
	if c.Schedules == nil {
		return true, "", nil
	}
	count, err := c.Schedules.CountSchedulesForClassDay(ctx, tenantID, academicYearID, classID, isoWeekday(date))
	return count > 0, "", err
}

// TeachingDays is IsTeachingDay for many classes over [from, to] at once:
// for each class, the dates it has lessons on, at midnight UTC from their
// own year, month and day. Each class is read once and the calendar once
// per distinct grade level, instead of both once per class and date.
func (c ClassCalendar) TeachingDays(ctx context.Context, tenantID, academicYearID uuid.UUID, classIDs []uuid.UUID, from, to time.Time) (map[uuid.UUID][]time.Time, error) {
	byGrade := make(map[uuid.UUID][]time.Time)
	out := make(map[uuid.UUID][]time.Time, len(classIDs))
	for _, classID := range classIDs {
		if _, done := out[classID]; done {
			continue
		}
		class, err := c.Classes.GetClass(ctx, tenantID, classID)
		if err != nil {
			return nil, err
		}
		gradeLevelID := class.GradeLevelID
		days, ok := byGrade[gradeLevelID]
		if !ok {
			if days, err = c.Calendar.SchoolDaysInRange(ctx, tenantID, academicYearID, from, to, &gradeLevelID); err != nil {
				return nil, err
			}
			byGrade[gradeLevelID] = days
		}
		out[classID] = days
	}
	return c.keepTimetabledDays(ctx, tenantID, academicYearID, out)
}

// keepTimetabledDays drops, from each class's school days, the weekdays its
// timetable has no lesson on, reading every class's timetable in one query.
func (c ClassCalendar) keepTimetabledDays(ctx context.Context, tenantID, academicYearID uuid.UUID, byClass map[uuid.UUID][]time.Time) (map[uuid.UUID][]time.Time, error) {
	if c.Schedules == nil || len(byClass) == 0 {
		return byClass, nil
	}
	classIDs := make([]uuid.UUID, 0, len(byClass))
	for classID := range byClass {
		classIDs = append(classIDs, classID)
	}
	counts, err := c.Schedules.CountSchedulesByClassDay(ctx, tenantID, academicYearID, classIDs)
	if err != nil {
		return nil, err
	}
	timetabled := make(map[uuid.UUID]map[int16]bool, len(classIDs))
	for _, row := range counts {
		if row.Count == 0 {
			continue
		}
		if timetabled[row.ClassID] == nil {
			timetabled[row.ClassID] = map[int16]bool{}
		}
		timetabled[row.ClassID][row.DayOfWeek] = true
	}
	out := make(map[uuid.UUID][]time.Time, len(byClass))
	for classID, days := range byClass {
		kept := make([]time.Time, 0, len(days))
		for _, d := range days {
			if timetabled[classID][isoWeekday(d)] {
				kept = append(kept, d)
			}
		}
		out[classID] = kept
	}
	return out, nil
}

// isoWeekday is date's ISO weekday (Monday 1 .. Sunday 7), the numbering
// schedules and school days use.
func isoWeekday(date time.Time) int16 {
	if wd := date.Weekday(); wd != time.Sunday {
		return int16(wd)
	}
	return 7
}
