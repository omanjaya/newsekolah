package domain_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

func TestValidatePeriodTimes(t *testing.T) {
	require.NoError(t, domain.ValidatePeriodTimes(
		domain.ClockTime{Hour: 7, Minute: 0},
		domain.ClockTime{Hour: 7, Minute: 45},
	))

	err := domain.ValidatePeriodTimes(
		domain.ClockTime{Hour: 8, Minute: 0},
		domain.ClockTime{Hour: 8, Minute: 0},
	)
	require.ErrorIs(t, err, domain.ErrInvalidPeriod)

	err = domain.ValidatePeriodTimes(
		domain.ClockTime{Hour: 9, Minute: 0},
		domain.ClockTime{Hour: 8, Minute: 0},
	)
	require.ErrorIs(t, err, domain.ErrInvalidPeriod)
}

func TestValidateDayOfWeek(t *testing.T) {
	require.NoError(t, domain.ValidateDayOfWeek(1))
	require.NoError(t, domain.ValidateDayOfWeek(7))
	require.ErrorIs(t, domain.ValidateDayOfWeek(0), domain.ErrInvalidDayOfWeek)
	require.ErrorIs(t, domain.ValidateDayOfWeek(8), domain.ErrInvalidDayOfWeek)
}

func TestCurrentPeriod(t *testing.T) {
	periods := []domain.Period{
		{Name: "1", StartsAt: domain.ClockTime{Hour: 7}, EndsAt: domain.ClockTime{Hour: 7, Minute: 45}},
		{Name: "break", IsBreak: true, StartsAt: domain.ClockTime{Hour: 7, Minute: 45}, EndsAt: domain.ClockTime{Hour: 8}},
		{Name: "2", StartsAt: domain.ClockTime{Hour: 8}, EndsAt: domain.ClockTime{Hour: 8, Minute: 45}},
	}

	p, ok := domain.CurrentPeriod(periods, domain.ClockTime{Hour: 7, Minute: 30})
	require.True(t, ok)
	require.Equal(t, "1", p.Name)

	p, ok = domain.CurrentPeriod(periods, domain.ClockTime{Hour: 7, Minute: 45})
	require.True(t, ok)
	require.Equal(t, "break", p.Name)

	_, ok = domain.CurrentPeriod(periods, domain.ClockTime{Hour: 6, Minute: 0})
	require.False(t, ok)

	_, ok = domain.CurrentPeriod(periods, domain.ClockTime{Hour: 9, Minute: 0})
	require.False(t, ok)
}
