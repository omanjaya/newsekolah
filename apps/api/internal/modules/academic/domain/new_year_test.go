package domain_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

func TestPlanSubjectOfferingCopy(t *testing.T) {
	subject := uuid.New()
	grade := uuid.New()
	source := []domain.SubjectOffering{{SubjectID: subject, GradeLevelID: &grade, HoursPerWeek: 4}}

	t.Run("copies when the destination has nothing yet", func(t *testing.T) {
		plan := domain.PlanSubjectOfferingCopy(source, nil)
		require.Len(t, plan, 1)
		require.False(t, plan[0].AlreadyExists)
	})

	t.Run("skips when the destination already has the same subject and grade", func(t *testing.T) {
		destination := []domain.SubjectOffering{{SubjectID: subject, GradeLevelID: &grade, HoursPerWeek: 4}}
		plan := domain.PlanSubjectOfferingCopy(source, destination)
		require.Len(t, plan, 1)
		require.True(t, plan[0].AlreadyExists)
	})
}

func TestPlanClassCopy(t *testing.T) {
	grade := uuid.New()
	source := []domain.Class{{Name: "X IPA 1", GradeLevelID: grade}}

	t.Run("copies when the destination has no class of that name", func(t *testing.T) {
		plan := domain.PlanClassCopy(source, nil)
		require.Len(t, plan, 1)
		require.False(t, plan[0].AlreadyExists)
	})

	t.Run("skips when the destination already has a class of that name -- re-running a commit is a no-op", func(t *testing.T) {
		destination := []domain.Class{{Name: "X IPA 1", GradeLevelID: grade}}
		plan := domain.PlanClassCopy(source, destination)
		require.Len(t, plan, 1)
		require.True(t, plan[0].AlreadyExists)
	})
}
