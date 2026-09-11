package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

func TestIsDuplicateVisit(t *testing.T) {
	last := day("2026-09-10").Add(8 * time.Hour)

	require.True(t, domain.IsDuplicateVisit(last, last.Add(10*time.Minute)), "within the 30-minute window")
	require.False(t, domain.IsDuplicateVisit(last, last.Add(31*time.Minute)), "past the 30-minute window")
	require.False(t, domain.IsDuplicateVisit(time.Time{}, last), "no prior visit at all")
}
