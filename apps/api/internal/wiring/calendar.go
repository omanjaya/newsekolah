package wiring

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
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
type ClassCalendar struct {
	Calendar academic.CalendarReader
	Classes  academic.ClassReader
}

// IsTeachingDay reports whether classID has lessons on date and, when it
// does not, names the calendar event responsible (empty for an ordinary
// non-school weekday).
func (c ClassCalendar) IsTeachingDay(ctx context.Context, tenantID, academicYearID, classID uuid.UUID, date time.Time) (bool, string, error) {
	class, err := c.Classes.GetClass(ctx, tenantID, classID)
	if err != nil {
		return false, "", err
	}
	gradeLevelID := class.GradeLevelID
	teaching, err := c.Calendar.IsSchoolDay(ctx, tenantID, academicYearID, date, &gradeLevelID)
	if err != nil || teaching {
		return teaching, "", err
	}
	name, _, err := c.Calendar.NonTeachingEventName(ctx, tenantID, academicYearID, date, &gradeLevelID)
	return false, name, err
}
