package jobs

import (
	"testing"
	"time"
)

func TestEveryHourOnTheHour(t *testing.T) {
	schedule := EveryHourOnTheHour()
	cases := []struct{ now, want time.Time }{
		// A process started at 10:26 runs next at 11:00, not 11:26.
		{time.Date(2026, 11, 20, 10, 26, 15, 0, time.UTC), time.Date(2026, 11, 20, 11, 0, 0, 0, time.UTC)},
		// Exactly on the hour moves to the following hour (no double fire).
		{time.Date(2026, 11, 20, 11, 0, 0, 0, time.UTC), time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)},
		// Crosses midnight.
		{time.Date(2026, 11, 20, 23, 59, 59, 0, time.UTC), time.Date(2026, 11, 21, 0, 0, 0, 0, time.UTC)},
	}
	for _, tc := range cases {
		if got := schedule.Next(tc.now); !got.Equal(tc.want) {
			t.Errorf("Next(%s) = %s, want %s", tc.now, got, tc.want)
		}
	}

	// The boundary is also the top of the hour in Asia/Makassar (UTC+8).
	loc, err := time.LoadLocation("Asia/Makassar")
	if err != nil {
		t.Skip("tzdata unavailable")
	}
	next := schedule.Next(time.Date(2026, 11, 20, 10, 26, 0, 0, loc))
	if next.In(loc).Minute() != 0 || next.In(loc).Hour() != 11 {
		t.Errorf("Next in Makassar = %s, want 11:00 local", next.In(loc))
	}
}
