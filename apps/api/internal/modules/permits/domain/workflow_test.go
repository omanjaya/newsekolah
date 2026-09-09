package domain

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDefinitionNextIndex(t *testing.T) {
	def := Definition{Stages: DefaultStages(KindLateArrival)}
	require.Len(t, def.Stages, 3)

	tests := []struct {
		name       string
		current    int
		wantNext   int
		wantIsLast bool
	}{
		{"first to second", 0, 1, false},
		{"second to third", 1, 2, false},
		{"third is last", 2, 2, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			next, isLast := def.NextIndex(tt.current)
			require.Equal(t, tt.wantNext, next)
			require.Equal(t, tt.wantIsLast, isLast)
		})
	}
}

func TestDefinitionStageAt(t *testing.T) {
	def := Definition{Stages: DefaultStages(KindExitPermit)}

	stage, err := def.StageAt(0)
	require.NoError(t, err)
	require.Equal(t, "duty_teacher", stage.Key)

	_, err = def.StageAt(-1)
	require.ErrorIs(t, err, ErrStageIndexOutOfRange)

	_, err = def.StageAt(len(def.Stages))
	require.ErrorIs(t, err, ErrStageIndexOutOfRange)
}

func TestDefinitionStageByKey(t *testing.T) {
	def := Definition{Stages: DefaultStages(KindExitPermit)}

	stage, ok := def.StageByKey("class_teacher")
	require.True(t, ok)
	require.Equal(t, "teacher_of_class_now", stage.ApproverRule)
	require.Equal(t, []string{"duty_teacher"}, stage.DistinctFrom)

	_, ok = def.StageByKey("does_not_exist")
	require.False(t, ok)
}

func TestInstanceCanTransition(t *testing.T) {
	require.True(t, Instance{Status: StatusInProgress}.CanTransition())
	for _, s := range []Status{StatusApproved, StatusRejected, StatusCompleted, StatusCancelled, StatusExpired} {
		require.False(t, Instance{Status: s}.CanTransition(), "status %s should not be transitionable", s)
	}
}

func TestStatusIsTerminal(t *testing.T) {
	require.False(t, StatusInProgress.IsTerminal())
	require.False(t, StatusApproved.IsTerminal())
	for _, s := range []Status{StatusRejected, StatusCompleted, StatusCancelled, StatusExpired} {
		require.True(t, s.IsTerminal())
	}
}

func TestDefaultStagesMatchOldBehaviour(t *testing.T) {
	// docs/analysis/backend-inventory.md 1.14-1.16: default stage order
	// must reproduce the old app's hardcoded chains exactly, so switching
	// to the configurable engine is behaviour-neutral.
	exitKeys := stageKeys(DefaultStages(KindExitPermit))
	require.Equal(t, []string{"duty_teacher", "class_teacher", "counselor", "leadership"}, exitKeys)

	lateKeys := stageKeys(DefaultStages(KindLateArrival))
	require.Equal(t, []string{"duty_teacher", "leadership", "class_teacher"}, lateKeys)

	leaveKeys := stageKeys(DefaultStages(KindLeaveRequest))
	require.Equal(t, []string{"homeroom", "counselor"}, leaveKeys)

	require.Nil(t, DefaultStages(Kind("bogus")))
}

func stageKeys(stages []Stage) []string {
	keys := make([]string, len(stages))
	for i, s := range stages {
		keys[i] = s.Key
	}
	return keys
}

func TestKindValid(t *testing.T) {
	require.True(t, KindExitPermit.Valid())
	require.True(t, KindLateArrival.Valid())
	require.True(t, KindLeaveRequest.Valid())
	require.False(t, Kind("bogus").Valid())
}
