package domain_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
)

func TestComputeDailyStatus(t *testing.T) {
	policy := domain.DefaultStatusPolicy()

	tests := []struct {
		name              string
		expectedSessions  int
		submittedSessions int
		entries           []string
		want              domain.DailyStatus
	}{
		{
			name:              "no schedule that day",
			expectedSessions:  0,
			submittedSessions: 0,
			entries:           nil,
			want:              domain.DailyStatus{StatusCode: domain.StatusNone, Expected: 0, Submitted: 0, Complete: true},
		},
		{
			name:              "nothing submitted yet",
			expectedSessions:  3,
			submittedSessions: 0,
			entries:           nil,
			want:              domain.DailyStatus{StatusCode: domain.StatusIncomplete, Expected: 3, Submitted: 0, Complete: false},
		},
		{
			name:              "submitted session but no entries recorded",
			expectedSessions:  1,
			submittedSessions: 1,
			entries:           nil,
			want:              domain.DailyStatus{StatusCode: domain.StatusMixed, Expected: 1, Submitted: 1, Complete: true},
		},
		{
			name:              "uniform present, fully submitted",
			expectedSessions:  4,
			submittedSessions: 4,
			entries:           []string{"H", "H", "H", "H"},
			want:              domain.DailyStatus{StatusCode: "H", Expected: 4, Submitted: 4, Complete: true},
		},
		{
			name:              "strict majority present, still incomplete",
			expectedSessions:  5,
			submittedSessions: 3,
			entries:           []string{"H", "H", "S"},
			want:              domain.DailyStatus{StatusCode: "H", Expected: 5, Submitted: 3, Complete: false},
		},
		{
			name:              "exact half is not a strict majority, falls back to priority",
			expectedSessions:  2,
			submittedSessions: 2,
			entries:           []string{"H", "A"},
			// A (priority 1) outranks H (priority 5) when there is no
			// majority: an unexcused absence in even one session must
			// surface over a merely-present one.
			want: domain.DailyStatus{StatusCode: "A", Expected: 2, Submitted: 2, Complete: true},
		},
		{
			name:              "three-way split resolved by priority, not entry order",
			expectedSessions:  3,
			submittedSessions: 3,
			entries:           []string{"S", "I", "D"},
			// D (priority 2) beats I (3) and S (4).
			want: domain.DailyStatus{StatusCode: "D", Expected: 3, Submitted: 3, Complete: true},
		},
		{
			name:              "alpha majority",
			expectedSessions:  3,
			submittedSessions: 3,
			entries:           []string{"A", "A", "H"},
			want:              domain.DailyStatus{StatusCode: "A", Expected: 3, Submitted: 3, Complete: true},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := domain.ComputeDailyStatus(tc.expectedSessions, tc.submittedSessions, tc.entries, policy)
			require.Equal(t, tc.want, got)
		})
	}
}

func TestComputeDailyStatusIsDeterministic(t *testing.T) {
	policy := domain.DefaultStatusPolicy()
	// Same multiset of entries in a different order must resolve to the
	// same status: every consumer (calendar, homeroom, report, monitor)
	// depends on this being order-independent since they may accumulate
	// entries from storage in different orders.
	a := domain.ComputeDailyStatus(2, 2, []string{"S", "I"}, policy)
	b := domain.ComputeDailyStatus(2, 2, []string{"I", "S"}, policy)
	require.Equal(t, a, b)
}

func TestStatusPolicyCountsAsPresent(t *testing.T) {
	policy := domain.DefaultStatusPolicy()
	require.True(t, policy.CountsAsPresent("H"))
	require.False(t, policy.CountsAsPresent("A"))
	require.False(t, policy.CountsAsPresent("unknown"))
	require.True(t, policy.IsValid("S"))
	require.False(t, policy.IsValid("X"))
}
