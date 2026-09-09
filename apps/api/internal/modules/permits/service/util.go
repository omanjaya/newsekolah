package service

import "time"

// combineDateAndDuration returns date's calendar day combined with a
// wall-clock offset from midnight (a periods.starts_at/ends_at value,
// decoded to a time.Duration by repository/), in date's own location.
func combineDateAndDuration(date time.Time, sinceMidnight time.Duration) time.Time {
	y, m, d := date.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, date.Location()).Add(sinceMidnight)
}
