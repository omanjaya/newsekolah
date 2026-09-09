package wiring

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
)

// AttendanceCalendar exposes the academic module's calendar (weekly
// pattern plus holidays, no-school days, and semester breaks) to the
// attendance module's daily-status algorithm, so "was there school that
// day" always accounts for the real calendar instead of only the weekly
// pattern. Constructed here rather than attendance importing the academic
// module directly, per docs/03-layered-architecture.md section 1.
type AttendanceCalendar struct{ Academic academic.CalendarReader }

func (c AttendanceCalendar) IsSchoolDay(ctx context.Context, tenantID, academicYearID uuid.UUID, date time.Time, gradeLevelID *uuid.UUID) (bool, error) {
	return c.Academic.IsSchoolDay(ctx, tenantID, academicYearID, date, gradeLevelID)
}
