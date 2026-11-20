package jobs

import (
	"time"

	"github.com/riverqueue/river"
)

// topOfHour fires at minute zero of every hour.
type topOfHour struct{}

func (topOfHour) Next(t time.Time) time.Time {
	return t.Truncate(time.Hour).Add(time.Hour)
}

// EveryHourOnTheHour is the schedule for an hourly job whose work is tied
// to clock hours (a report due at 11:00, a digest for the 08:00 hour).
// river.PeriodicInterval(time.Hour) counts from process start instead, so
// every run lands at the boot minute and a restart shifts it again; this
// one fires at hh:00:00 whatever the start time. Pair it with
// PeriodicJobOpts.RunOnStart so an hour that began while the process was
// down is still handled once it is back.
//
// The boundary is a UTC hour, which is also a local hour in every
// whole-hour timezone (all of Indonesia's).
func EveryHourOnTheHour() river.PeriodicSchedule {
	return topOfHour{}
}
