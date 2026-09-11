package service

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// TestLateArrivalActionsConfigRoundTrip covers the JSON-object-keys-are-
// strings conversion tenant_policies(kind='late_arrival_actions') needs:
// an int occurrence number must survive being written as a JSON object
// key and read back.
func TestLateArrivalActionsConfigRoundTrip(t *testing.T) {
	original := domain.DefaultLateArrivalActions()
	roundTripped := fromLateArrivalActionsConfig(toLateArrivalActionsConfig(original))
	require.Equal(t, original, roundTripped)
}

func TestFromLateArrivalActionsConfig_IgnoresUnparsableKeys(t *testing.T) {
	cfg := lateArrivalActionsConfig{"2": domain.RequiredActionCallParent, "not-a-number": domain.RequiredActionSendHome}
	got := fromLateArrivalActionsConfig(cfg)
	require.Equal(t, map[int]domain.RequiredAction{2: domain.RequiredActionCallParent}, got)
}
