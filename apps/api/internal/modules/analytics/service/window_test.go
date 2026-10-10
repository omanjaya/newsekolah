package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func date(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

// The window is the latest windowDays calendar days of the month the run
// happens in, future days of that month included: this is the long-standing
// behavior the batch read preserves, so it is pinned here.
func TestAttendanceWindowDates_CurrentMonthIncludesItsFutureDays(t *testing.T) {
	dates := attendanceWindowDates(20, time.Date(2026, time.March, 15, 6, 0, 0, 0, time.UTC))

	require.Len(t, dates, 20)
	require.Equal(t, date(2026, time.March, 31), dates[0])
	require.Equal(t, date(2026, time.March, 12), dates[19])
}

func TestAttendanceWindowDates_WalksBackWhenAMonthIsTooShort(t *testing.T) {
	dates := attendanceWindowDates(40, time.Date(2026, time.February, 10, 6, 0, 0, 0, time.UTC))

	require.Len(t, dates, 40)
	require.Equal(t, date(2026, time.February, 28), dates[0])
	require.Equal(t, date(2026, time.February, 1), dates[27])
	require.Equal(t, date(2026, time.January, 31), dates[28])
	require.Equal(t, date(2026, time.January, 20), dates[39])
}

// Stepping back one month from the 31st lands on a date that normalizes
// into the same month, so the month is read twice and its days listed twice;
// each listing counts, exactly as when the window was read month by month.
func TestAttendanceWindowDates_RepeatedMonthKeepsDuplicates(t *testing.T) {
	dates := attendanceWindowDates(45, time.Date(2026, time.March, 31, 6, 0, 0, 0, time.UTC))

	require.Len(t, dates, 45)
	require.Equal(t, date(2026, time.March, 31), dates[0])
	require.Equal(t, date(2026, time.March, 31), dates[1])
	require.Equal(t, date(2026, time.March, 9), dates[44])
}
