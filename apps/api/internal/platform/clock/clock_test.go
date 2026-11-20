package clock_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

func TestLocationFallsBackToUTC(t *testing.T) {
	require.Equal(t, time.UTC, clock.Location(""))
	require.Equal(t, time.UTC, clock.Location("Not/AZone"))
	require.Equal(t, "Asia/Makassar", clock.Location("Asia/Makassar").String())
}

func TestLocationIsCachedPerName(t *testing.T) {
	require.Same(t, clock.Location("Asia/Jakarta"), clock.Location("Asia/Jakarta"))
	// A cached unknown name keeps falling back to UTC.
	require.Equal(t, time.UTC, clock.Location("Not/AZone"))
	require.Equal(t, time.UTC, clock.Location("Not/AZone"))
}

func TestLocalDateUsesTheZonesCalendarDay(t *testing.T) {
	// 23:30 UTC on 19 November is already 07:30 on 20 November in
	// Asia/Makassar (UTC+8).
	at := time.Date(2026, 11, 19, 23, 30, 0, 0, time.UTC)
	require.Equal(t, time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC), clock.LocalDate(at, clock.Location("Asia/Makassar")))
	require.Equal(t, time.Date(2026, 11, 19, 0, 0, 0, 0, time.UTC), clock.LocalDate(at, time.UTC))
	require.Equal(t, time.Date(2026, 11, 19, 0, 0, 0, 0, time.UTC), clock.LocalDate(at, nil))
}
