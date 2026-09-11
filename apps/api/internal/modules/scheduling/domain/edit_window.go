package domain

import "time"

// TeacherEditAllowed enforces the tenant setting
// schedule.teacher_edit_deadline: a teacher may create or edit their own
// (source=teacher) schedule only until deadline before the next time that
// slot actually occurs in class. occursAt is the concrete timestamp of the
// next occurrence of the schedule's day-of-week and start period, resolved
// by the service (it needs the tenant's timezone and the period template,
// neither of which belongs in domain); this function only compares two
// instants, which is what makes it unit-testable without a clock or a
// database.
func TeacherEditAllowed(now, occursAt time.Time, deadline time.Duration) bool {
	return now.Before(occursAt.Add(-deadline))
}

// TeacherEditAllowedBefore enforces the older, absolute form of
// schedule.teacher_edit_deadline: an RFC3339 timestamp naming a single
// cutoff (e.g. "fill in your schedule before the semester starts") rather
// than a rolling per-occurrence duration. A teacher may edit only before
// that instant.
func TeacherEditAllowedBefore(now, deadline time.Time) bool {
	return now.Before(deadline)
}
