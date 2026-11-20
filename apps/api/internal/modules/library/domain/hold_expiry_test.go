package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

func TestHoldExpiresAtCountsOpenLibraryDaysOnTheSchoolsCalendar(t *testing.T) {
	wita, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	rule := domain.WorkingDayRule{SaturdayClosed: true, SundayClosed: true, Holidays: map[string]bool{"2026-11-25": true}}

	cases := []struct {
		name    string
		readyAt time.Time
		want    time.Time
	}{
		{
			// Fri 20 Nov 15:40 WITA, weekend closed: Mon and Tue are the two
			// open days, so the hold lasts to the end of Tuesday instead of
			// lapsing on Sunday while the library is shut.
			name:    "friday afternoon skips the closed weekend",
			readyAt: time.Date(2026, 11, 20, 7, 40, 0, 0, time.UTC),
			want:    time.Date(2026, 11, 24, 23, 59, 59, 0, wita),
		},
		{
			// Mon 23 Nov 07:30 WITA is still Sunday 22 Nov in UTC; the hold
			// counts from Monday on the school's calendar (Tue, then Thu as
			// Wed 25 Nov is a holiday).
			name:    "early morning reads the local day and skips a holiday",
			readyAt: time.Date(2026, 11, 22, 23, 30, 0, 0, time.UTC),
			want:    time.Date(2026, 11, 26, 23, 59, 59, 0, wita),
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := rule.HoldExpiresAt(tc.readyAt, wita, 2)
			require.True(t, tc.want.Equal(got), "want %s, got %s", tc.want, got.In(wita))
		})
	}
}
