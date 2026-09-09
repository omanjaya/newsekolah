package domain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestTokenTTL(t *testing.T) {
	now := time.Date(2026, 3, 10, 7, 0, 0, 0, time.UTC)

	tests := []struct {
		name         string
		purpose      Purpose
		periodEndsAt time.Time
		want         time.Duration
	}{
		{"classroom entry is short lived", PurposeClassroomEntry, time.Time{}, shortLivedTTL},
		{"late arrival is short lived", PurposeLateArrival, time.Time{}, shortLivedTTL},
		{"approve stage is short lived", PurposeApproveStage, time.Time{}, shortLivedTTL},
		{"gate exit lasts until period end", PurposeGateExit, now.Add(3 * time.Hour), 3 * time.Hour},
		{"gate exit past period end still grants a window", PurposeGateExit, now.Add(-time.Minute), shortLivedTTL},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, TokenTTL(tt.purpose, now, tt.periodEndsAt))
		})
	}
}

func TestPurposeValid(t *testing.T) {
	require.True(t, PurposeApproveStage.Valid())
	require.True(t, PurposeGateExit.Valid())
	require.False(t, Purpose("unknown").Valid())
}

func TestScanTokenState(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	fresh := ScanToken{ExpiresAt: now.Add(time.Minute)}
	require.False(t, fresh.IsExpired(now))
	require.False(t, fresh.IsConsumed())

	expired := ScanToken{ExpiresAt: now.Add(-time.Second)}
	require.True(t, expired.IsExpired(now))

	consumedAt := now
	consumed := ScanToken{ConsumedAt: &consumedAt}
	require.True(t, consumed.IsConsumed())
}
