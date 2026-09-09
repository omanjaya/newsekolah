package domain

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestActionForOccurrence(t *testing.T) {
	policy := DefaultLateArrivalActions()

	tests := []struct {
		occurrence int
		want       RequiredAction
	}{
		{1, RequiredActionNone},
		{2, RequiredActionCallParent},
		{3, RequiredActionSendHome},
		{4, RequiredActionNone},
		{5, RequiredActionCallParent},
		{6, RequiredActionSendHome},
		{7, RequiredActionNone},
	}
	for _, tt := range tests {
		require.Equalf(t, tt.want, ActionForOccurrence(tt.occurrence, policy), "occurrence %d", tt.occurrence)
	}
}

func TestActionForOccurrenceCustomPolicy(t *testing.T) {
	// A tenant can override the default entirely via tenant_policies.
	custom := map[int]RequiredAction{1: RequiredActionSendHome}
	require.Equal(t, RequiredActionSendHome, ActionForOccurrence(1, custom))
	require.Equal(t, RequiredActionNone, ActionForOccurrence(2, custom))
}
