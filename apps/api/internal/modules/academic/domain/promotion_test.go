package domain_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

func TestBuildPromotionPlan(t *testing.T) {
	gradeX := uuid.New()
	gradeXI := uuid.New()
	gradeXII := uuid.New()
	classXI := uuid.New()
	classXII := uuid.New()
	ipa := uuid.New()

	gradeLevelBySequence := map[int16]uuid.UUID{1: gradeX, 2: gradeXI, 3: gradeXII}
	targets := []domain.TargetClass{
		{ClassID: classXI, GradeLevelID: gradeXI, TrackID: &ipa},
		{ClassID: classXII, GradeLevelID: gradeXII},
	}

	t.Run("promotes to the matching next-grade class", func(t *testing.T) {
		student := uuid.New()
		enrollment := uuid.New()
		fromClass := uuid.New()
		candidates := []domain.PromotionCandidate{
			{StudentUserID: student, EnrollmentID: enrollment, FromClassID: fromClass, GradeLevelID: gradeX, GradeSequence: 1, TrackID: &ipa},
		}

		plan := domain.BuildPromotionPlan(candidates, targets, nil, gradeLevelBySequence, 3)

		require.Len(t, plan, 1)
		require.Equal(t, domain.PromotionActionPromote, plan[0].Action)
		require.NotNil(t, plan[0].TargetClassID)
		require.Equal(t, classXI, *plan[0].TargetClassID)
		require.False(t, plan[0].Unresolved)
	})

	t.Run("graduates a student at the highest known sequence", func(t *testing.T) {
		candidates := []domain.PromotionCandidate{
			{StudentUserID: uuid.New(), EnrollmentID: uuid.New(), FromClassID: classXII, GradeLevelID: gradeXII, GradeSequence: 3},
		}

		plan := domain.BuildPromotionPlan(candidates, targets, nil, gradeLevelBySequence, 3)

		require.Len(t, plan, 1)
		require.Equal(t, domain.PromotionActionGraduate, plan[0].Action)
		require.Nil(t, plan[0].TargetClassID)
		require.False(t, plan[0].Unresolved)
	})

	t.Run("marks unresolved when no target class matches the track", func(t *testing.T) {
		otherTrack := uuid.New()
		candidates := []domain.PromotionCandidate{
			{StudentUserID: uuid.New(), EnrollmentID: uuid.New(), FromClassID: uuid.New(), GradeLevelID: gradeX, GradeSequence: 1, TrackID: &otherTrack},
		}

		plan := domain.BuildPromotionPlan(candidates, targets, nil, gradeLevelBySequence, 3)

		require.Len(t, plan, 1)
		require.Equal(t, domain.PromotionActionPromote, plan[0].Action)
		require.Nil(t, plan[0].TargetClassID)
		require.True(t, plan[0].Unresolved)
	})

	t.Run("an explicit override always wins", func(t *testing.T) {
		student := uuid.New()
		forcedClass := uuid.New()
		candidates := []domain.PromotionCandidate{
			{StudentUserID: student, EnrollmentID: uuid.New(), FromClassID: uuid.New(), GradeLevelID: gradeX, GradeSequence: 1},
		}
		overrides := []domain.PromotionOverride{
			{StudentUserID: student, Action: domain.PromotionActionRetain, TargetClassID: &forcedClass},
		}

		plan := domain.BuildPromotionPlan(candidates, targets, overrides, gradeLevelBySequence, 3)

		require.Len(t, plan, 1)
		require.Equal(t, domain.PromotionActionRetain, plan[0].Action)
		require.Equal(t, forcedClass, *plan[0].TargetClassID)
	})

	t.Run("an override can force a transfer out, with no target class needed", func(t *testing.T) {
		student := uuid.New()
		candidates := []domain.PromotionCandidate{
			{StudentUserID: student, EnrollmentID: uuid.New(), FromClassID: uuid.New(), GradeLevelID: gradeX, GradeSequence: 1},
		}
		overrides := []domain.PromotionOverride{{StudentUserID: student, Action: domain.PromotionActionTransfer}}

		plan := domain.BuildPromotionPlan(candidates, targets, overrides, gradeLevelBySequence, 3)

		require.Len(t, plan, 1)
		require.Equal(t, domain.PromotionActionTransfer, plan[0].Action)
		require.Nil(t, plan[0].TargetClassID)
		require.False(t, plan[0].Unresolved)
	})

	t.Run("an override can force graduation early", func(t *testing.T) {
		student := uuid.New()
		candidates := []domain.PromotionCandidate{
			{StudentUserID: student, EnrollmentID: uuid.New(), FromClassID: uuid.New(), GradeLevelID: gradeX, GradeSequence: 1},
		}
		overrides := []domain.PromotionOverride{{StudentUserID: student, Action: domain.PromotionActionGraduate}}

		plan := domain.BuildPromotionPlan(candidates, targets, overrides, gradeLevelBySequence, 3)

		require.Equal(t, domain.PromotionActionGraduate, plan[0].Action)
		require.Nil(t, plan[0].TargetClassID)
	})
}
