package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
)

func TestScheduleDayInEffectOnStartsOnTheSchoolLocalCreationDate(t *testing.T) {
	makassar, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	// 20 Nov 17:00 UTC is already 21 Nov 01:00 in Makassar.
	day := domain.ScheduleDay{CreatedAt: time.Date(2026, 11, 20, 17, 0, 0, 0, time.UTC)}

	require.False(t, day.InEffectOn(time.Date(2026, 11, 20, 0, 0, 0, 0, makassar)),
		"the day before the school-local creation date has no schedule yet")
	require.True(t, day.InEffectOn(time.Date(2026, 11, 21, 0, 0, 0, 0, makassar)),
		"the creation date itself counts")
	require.True(t, day.InEffectOn(time.Date(2026, 11, 30, 0, 0, 0, 0, makassar)))
}

func TestScheduleDayWithoutCreationTimeIsAlwaysInEffect(t *testing.T) {
	require.True(t, domain.ScheduleDay{}.InEffectOn(time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC)))
}
