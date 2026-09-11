package domain_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
)

func TestPartitionBlocked(t *testing.T) {
	clear, blockedStudent := uuid.New(), uuid.New()
	blocked := func(id uuid.UUID) bool { return id == blockedStudent }

	t.Run("skips only the blocked student", func(t *testing.T) {
		skipped := domain.PartitionBlocked([]uuid.UUID{clear, blockedStudent}, blocked)
		require.Equal(t, []uuid.UUID{blockedStudent}, skipped)
	})

	t.Run("nobody blocked skips nobody", func(t *testing.T) {
		skipped := domain.PartitionBlocked([]uuid.UUID{clear, clear}, blocked)
		require.Empty(t, skipped)
	})

	t.Run("everybody blocked skips everybody, in order", func(t *testing.T) {
		second := uuid.New()
		skipped := domain.PartitionBlocked([]uuid.UUID{blockedStudent, second}, func(uuid.UUID) bool { return true })
		require.Equal(t, []uuid.UUID{blockedStudent, second}, skipped)
	})

	t.Run("empty input", func(t *testing.T) {
		require.Empty(t, domain.PartitionBlocked(nil, blocked))
	})
}
