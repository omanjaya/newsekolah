package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
)

func TestScheduleDayAsOfStartsOnTheSchoolLocalCreationDate(t *testing.T) {
	makassar, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	// 20 Nov 17:00 UTC is already 21 Nov 01:00 in Makassar.
	created := time.Date(2026, 11, 20, 17, 0, 0, 0, time.UTC)
	day := domain.ScheduleDay{IsWorkingDay: true, CreatedAt: created, WorkingSince: created}

	require.Nil(t, day.AsOf(time.Date(2026, 11, 20, 0, 0, 0, 0, makassar)),
		"the day before the school-local creation date has no schedule yet")
	got := day.AsOf(time.Date(2026, 11, 21, 0, 0, 0, 0, makassar))
	require.NotNil(t, got, "the creation date itself counts")
	require.True(t, got.IsWorkingDay)
	require.NotNil(t, day.AsOf(time.Date(2026, 11, 30, 0, 0, 0, 0, makassar)))
}

func TestScheduleDayWithoutCreationTimeIsAlwaysInEffect(t *testing.T) {
	got := domain.ScheduleDay{IsWorkingDay: true}.AsOf(time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC))
	require.NotNil(t, got)
	require.True(t, got.IsWorkingDay)
}

// A weekday saved as a day off on 2 Nov and turned into a working day on
// 20 Nov was a day off in between, not a gap in the configuration.
func TestScheduleDayAsOfIsADayOffBeforeTheWeekdayBecameWorking(t *testing.T) {
	makassar, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	day := domain.ScheduleDay{
		IsWorkingDay: true,
		CreatedAt:    time.Date(2026, 11, 2, 7, 0, 0, 0, makassar),
		WorkingSince: time.Date(2026, 11, 20, 12, 0, 0, 0, makassar),
	}

	require.Nil(t, day.AsOf(time.Date(2026, 11, 1, 0, 0, 0, 0, makassar)))
	before := day.AsOf(time.Date(2026, 11, 14, 0, 0, 0, 0, makassar))
	require.NotNil(t, before, "the weekday had a row on 14 Nov")
	require.False(t, before.IsWorkingDay, "it was a day off then")
	require.True(t, day.IsWorkingDay, "the row itself is left as stored")
	after := day.AsOf(time.Date(2026, 11, 21, 0, 0, 0, 0, makassar))
	require.NotNil(t, after)
	require.True(t, after.IsWorkingDay)
}
