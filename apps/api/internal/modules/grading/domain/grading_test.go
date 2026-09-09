package domain_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
)

func TestWeightedAverageSkipsUngradedComponents(t *testing.T) {
	quiz := domain.Component{ID: uuid.New(), Weight: 1}
	exam := domain.Component{ID: uuid.New(), Weight: 3}
	components := []domain.Component{quiz, exam}

	avg, ok := domain.WeightedAverage(components, map[uuid.UUID]float64{quiz.ID: 80, exam.ID: 60})
	require.True(t, ok)
	require.InDelta(t, 65, avg, 0.001, "the exam's weight of 3 dominates")

	avg, ok = domain.WeightedAverage(components, map[uuid.UUID]float64{quiz.ID: 80})
	require.True(t, ok)
	require.InDelta(t, 80, avg, 0.001, "an ungraded component is skipped, not counted as zero")

	_, ok = domain.WeightedAverage(components, map[uuid.UUID]float64{})
	require.False(t, ok, "no grades at all means no average")
}

func TestReportScoreAppliesRangeAndFloor(t *testing.T) {
	scale := domain.DefaultScale()
	ranges := []domain.GradeRange{{MinScore: 60, MaxScore: 70, IncreaseAmount: 3}}

	require.InDelta(t, 68, domain.ReportScore(scale, 65, nil, ranges), 0.001, "a matching range raises the score")
	require.InDelta(t, 75, domain.ReportScore(scale, 75, nil, ranges), 0.001, "a score outside every range is unchanged")

	previous := 80.0
	require.InDelta(t, 80, domain.ReportScore(scale, 65, &previous, ranges), 0.001, "a report never drops below the previous term")
}

func TestReportScoreRespectsScaleCaps(t *testing.T) {
	scale := domain.DefaultScale()
	scale.IncreaseMax = 2

	ranges := []domain.GradeRange{{MinScore: 0, MaxScore: 100, IncreaseAmount: 10}}
	require.InDelta(t, 52, domain.ReportScore(scale, 50, nil, ranges), 0.001, "the school-wide cap wins over a generous range")
	require.InDelta(t, 100, domain.ReportScore(scale, 99.5, nil, ranges), 0.001, "the result is clamped to the scale maximum")
}

func TestApplyStarRefusesNegativeBalance(t *testing.T) {
	balance, err := domain.ApplyStar(2, 3)
	require.NoError(t, err)
	require.Equal(t, 5, balance)

	balance, err = domain.ApplyStar(2, -2)
	require.NoError(t, err)
	require.Equal(t, 0, balance)

	_, err = domain.ApplyStar(1, -2)
	require.ErrorIs(t, err, domain.ErrStarBalanceNegative)

	_, err = domain.ApplyStar(1, 0)
	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestScaleValidate(t *testing.T) {
	require.NoError(t, domain.DefaultScale().Validate())

	invalid := domain.DefaultScale()
	invalid.Max = invalid.Min
	require.Error(t, invalid.Validate())

	invalid = domain.DefaultScale()
	invalid.RoundDecimal = 9
	require.Error(t, invalid.Validate())
}
