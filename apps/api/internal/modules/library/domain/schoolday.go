package domain

import "time"

// SchoolDay is the school's calendar day at instant t: t read in the
// tenant's zone loc, kept as midnight UTC. That is the shape every DATE
// column of the module (due_on, loan rule starts_on/ends_on, holiday keys,
// valid_until, suspended_until) comes back from the repository in, so the
// result compares, steps and formats like one of them.
//
// Every circulation date rule (due dates, lateness, renewals, loan rules,
// membership validity) is decided on this day, never on the instant's own
// UTC date: at 07:30 in a UTC+8 school the UTC date is still yesterday.
func SchoolDay(t time.Time, loc *time.Location) time.Time {
	if loc == nil {
		loc = time.UTC
	}
	local := t.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
}
