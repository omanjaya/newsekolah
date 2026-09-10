package domain

import "time"

// IsoWeekday maps time.Weekday (Sunday=0..Saturday=6) onto the schema's
// day_of_week convention (Monday=1..Sunday=7), matching
// staff_attendance_schedules.weekday. Duplicated from
// attendance/domain.IsoWeekday since domain packages import nothing from
// each other per docs/03-layered-architecture.md section 1.
func IsoWeekday(t time.Time) int16 {
	w := int16(t.Weekday()) //nolint:gosec // Weekday is 0..6
	if w == 0 {
		return 7
	}
	return w
}
