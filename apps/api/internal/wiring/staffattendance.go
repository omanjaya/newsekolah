package wiring

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
)

// StaffAttendanceCalendar exposes the academic module's calendar to staff
// attendance's lateness algorithm, the same adapter shape as
// AttendanceCalendar in calendar.go above but with no grade-level
// targeting: a staff member's working day is never scoped to one grade.
type StaffAttendanceCalendar struct{ Academic academic.CalendarReader }

func (c StaffAttendanceCalendar) IsSchoolDay(ctx context.Context, tenantID, academicYearID uuid.UUID, date time.Time) (bool, error) {
	return c.Academic.IsSchoolDay(ctx, tenantID, academicYearID, date, nil)
}

func (c StaffAttendanceCalendar) HolidayName(ctx context.Context, tenantID, academicYearID uuid.UUID, date time.Time) (string, bool, error) {
	return c.Academic.NonTeachingEventName(ctx, tenantID, academicYearID, date, nil)
}

// StaffAttendanceLeave exposes permits' issued leave requests to staff
// attendance, reusing ListMyLeaveRequests (built for a student's own leave
// history, but its query filters only by workflow_instances.subject_user_id,
// so it works unchanged for an employee) rather than growing a second leave
// concept in staff attendance itself, per
// docs/03-layered-architecture.md section 1.
type StaffAttendanceLeave struct{ Permits *permitsservice.Service }

func (l StaffAttendanceLeave) OnApprovedLeave(ctx context.Context, tenantID, employeeUserID uuid.UUID, date time.Time) (bool, error) {
	const maxRecentLeaveRequests = 100
	items, err := l.Permits.ListMyLeaveRequests(ctx, tenantID, employeeUserID, maxRecentLeaveRequests, 0)
	if err != nil {
		return false, err
	}
	for _, item := range items {
		if !item.IsIssued() {
			continue
		}
		if !date.Before(item.StartsOn) && !date.After(item.EndsOn) {
			return true, nil
		}
	}
	return false, nil
}
