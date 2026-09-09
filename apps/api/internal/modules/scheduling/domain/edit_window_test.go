package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

func TestTeacherEditAllowed(t *testing.T) {
	occursAt := time.Date(2026, 3, 9, 7, 0, 0, 0, time.UTC)
	deadline := 24 * time.Hour

	require.True(t, domain.TeacherEditAllowed(occursAt.Add(-48*time.Hour), occursAt, deadline))
	require.False(t, domain.TeacherEditAllowed(occursAt.Add(-1*time.Hour), occursAt, deadline))
	require.False(t, domain.TeacherEditAllowed(occursAt.Add(-24*time.Hour), occursAt, deadline), "exactly at the deadline is not allowed")
}

func TestValidatePeriodRange(t *testing.T) {
	require.NoError(t, domain.ValidatePeriodRange(1, 2))
	require.NoError(t, domain.ValidatePeriodRange(3, 3))
	require.ErrorIs(t, domain.ValidatePeriodRange(0, 2), domain.ErrInvalidPeriodRange)
	require.ErrorIs(t, domain.ValidatePeriodRange(3, 2), domain.ErrInvalidPeriodRange)
}
