package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
)

func date(day int) time.Time {
	return time.Date(2026, 11, day, 0, 0, 0, 0, time.UTC)
}

func saturday(working bool, from time.Time) domain.ScheduleDay {
	return domain.ScheduleDay{
		Weekday: 6, IsWorkingDay: working, StartMinute: 8 * 60, EndMinute: 16 * 60, GraceMinutes: 10, EffectiveFrom: from,
	}
}

func TestScheduleHistoryStartsOnTheFirstVersionDate(t *testing.T) {
	history := domain.ScheduleHistory{saturday(true, date(21))}

	require.Nil(t, history.InEffect(6, date(14)), "before its first version the weekday has no schedule")
	got := history.InEffect(6, date(21))
	require.NotNil(t, got, "the date a version takes effect counts")
	require.True(t, got.IsWorkingDay)
	require.NotNil(t, history.InEffect(6, date(28)))
	require.Nil(t, history.InEffect(5, date(28)), "another weekday has no version")
}

// The calendar date is read in the location the date carries: local
// midnight of 21 Nov in Makassar is still 20 Nov in UTC.
func TestScheduleHistoryReadsTheCalendarDateInItsOwnLocation(t *testing.T) {
	makassar, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	history := domain.ScheduleHistory{saturday(true, date(21))}

	require.NotNil(t, history.InEffect(6, time.Date(2026, 11, 21, 0, 0, 0, 0, makassar)))
	require.Nil(t, history.InEffect(6, time.Date(2026, 11, 20, 23, 0, 0, 0, makassar)))
}

// A working Saturday turned off on 30 Nov stays a working day on every
// Saturday before it (r4v-attendance-R1).
func TestScheduleHistoryTurningADayOffIsNotRetroactive(t *testing.T) {
	history := domain.ScheduleHistory{saturday(true, date(25)), saturday(false, date(30))}

	before := history.InEffect(6, date(28))
	require.NotNil(t, before)
	require.True(t, before.IsWorkingDay, "28 Nov was a working Saturday")
	after := history.InEffect(6, time.Date(2026, 12, 5, 0, 0, 0, 0, time.UTC))
	require.NotNil(t, after)
	require.False(t, after.IsWorkingDay)
}

// Off, then working, then off and working again: each date reads the
// version in effect on it.
func TestScheduleHistoryKeepsEveryPeriod(t *testing.T) {
	history := domain.ScheduleHistory{
		saturday(true, date(2)), saturday(false, date(9)), saturday(true, date(23)),
	}
	for day, working := range map[int]bool{7: true, 14: false, 21: false, 28: true} {
		got := history.InEffect(6, date(day))
		require.NotNil(t, got, "Saturday %d Nov", day)
		require.Equal(t, working, got.IsWorkingDay, "Saturday %d Nov", day)
	}
}

func TestScheduleHistoryLaterSaveOfTheSameDateWins(t *testing.T) {
	history := domain.ScheduleHistory{
		saturday(true, date(2)), saturday(false, date(30)), saturday(true, date(30)),
	}
	got := history.InEffect(6, date(30))
	require.NotNil(t, got)
	require.True(t, got.IsWorkingDay, "the second save of 30 Nov supersedes the first")
}

func TestScheduleHistoryForRecordFallsBackToTheFirstVersion(t *testing.T) {
	late := saturday(true, date(21))
	late.StartMinute = 9 * 60
	history := domain.ScheduleHistory{saturday(true, date(14)), late}

	before := history.ForRecord(6, date(7))
	require.NotNil(t, before, "a record before the schedule existed is judged by its first version")
	require.Equal(t, 8*60, before.StartMinute)
	inEffect := history.ForRecord(6, date(28))
	require.NotNil(t, inEffect)
	require.Equal(t, 9*60, inEffect.StartMinute)
	require.Nil(t, history.ForRecord(5, date(28)), "a weekday with no version has no schedule")
}

func TestScheduleHistoryWeekIsTheVersionOfEachWeekdayInEffect(t *testing.T) {
	monday := domain.ScheduleDay{Weekday: 1, IsWorkingDay: true, StartMinute: 7 * 60, EndMinute: 15 * 60, EffectiveFrom: date(2)}
	history := domain.ScheduleHistory{
		monday, saturday(true, date(2)), saturday(false, date(30)),
	}

	week := history.Week(date(28))
	require.Len(t, week, 2, "only weekdays with a version are listed")
	require.Equal(t, int16(1), week[0].Weekday)
	require.Equal(t, int16(6), week[1].Weekday)
	require.True(t, week[1].IsWorkingDay)
	require.False(t, history.Week(date(30))[1].IsWorkingDay)
	require.Empty(t, history.Week(date(1)))
}

func TestScheduleDaySameHours(t *testing.T) {
	base := saturday(true, date(2))
	require.True(t, base.SameHours(saturday(true, date(30))), "the date is not part of the hours")
	for _, change := range []func(*domain.ScheduleDay){
		func(d *domain.ScheduleDay) { d.IsWorkingDay = false },
		func(d *domain.ScheduleDay) { d.StartMinute++ },
		func(d *domain.ScheduleDay) { d.EndMinute++ },
		func(d *domain.ScheduleDay) { d.GraceMinutes++ },
	} {
		other := base
		change(&other)
		require.False(t, base.SameHours(other))
	}
}
