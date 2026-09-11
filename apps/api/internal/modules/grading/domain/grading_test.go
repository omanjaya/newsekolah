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

func TestWeightedKKTPAverageOnlyCountsScoredComponentsWithAKKTP(t *testing.T) {
	kktp70, kktp80 := 70.0, 80.0
	quiz := domain.Component{ID: uuid.New(), Weight: 1, KKTP: &kktp70}
	exam := domain.Component{ID: uuid.New(), Weight: 1, KKTP: &kktp80}
	noKKTP := domain.Component{ID: uuid.New(), Weight: 1}
	components := []domain.Component{quiz, exam, noKKTP}

	avg, ok := domain.WeightedKKTPAverage(components, map[uuid.UUID]float64{quiz.ID: 80, exam.ID: 60, noKKTP.ID: 90})
	require.True(t, ok)
	require.InDelta(t, 75, avg, 0.001, "noKKTP is scored but carries no KKTP, so it is skipped")

	_, ok = domain.WeightedKKTPAverage(components, map[uuid.UUID]float64{noKKTP.ID: 90})
	require.False(t, ok, "the only scored component has no KKTP")
}

func TestComputeReportScoreIgnoresRangeWithoutAPositivePrevious(t *testing.T) {
	scale := domain.DefaultScale()
	ranges := []domain.GradeRange{{MinScore: 60, MaxScore: 70, IncreaseAmount: 3}}

	result := domain.ComputeReportScore(scale, 65, nil, nil, ranges)
	require.InDelta(t, 65, result.Automatic, 0.001, "a range is a promotion floor from last term, not a first-term bonus")
	require.InDelta(t, 65, result.Final, 0.001)

	zero := 0.0
	result = domain.ComputeReportScore(scale, 65, &zero, nil, ranges)
	require.InDelta(t, 65, result.Automatic, 0.001, "a previous score of exactly zero is treated as no baseline")
}

func TestComputeReportScoreAddsIncreaseToThePreviousScore(t *testing.T) {
	scale := domain.DefaultScale()
	ranges := []domain.GradeRange{{MinScore: 60, MaxScore: 70, IncreaseAmount: 3}}
	previous := 80.0

	result := domain.ComputeReportScore(scale, 65, &previous, nil, ranges)
	require.InDelta(t, 83, result.Automatic, 0.001, "the increase adds to the previous score, not to the raw average")
}

func TestComputeReportScoreUsesTheConfiguredIncreaseInFull(t *testing.T) {
	scale := domain.DefaultScale()
	scale.IncreaseMax = 2 // report_increase_max no longer bounds a range's increase at computation time
	ranges := []domain.GradeRange{{MinScore: 0, MaxScore: 100, IncreaseAmount: 8}}
	previous := 80.0

	result := domain.ComputeReportScore(scale, 50, &previous, nil, ranges)
	require.InDelta(t, 88, result.Automatic, 0.001, "the full saved increase applies, not scale.IncreaseMax")
}

func TestComputeReportScoreClampsTheResultToTheScaleMaximum(t *testing.T) {
	scale := domain.DefaultScale()
	ranges := []domain.GradeRange{{MinScore: 0, MaxScore: 100, IncreaseAmount: 10}}
	previous := 99.0

	result := domain.ComputeReportScore(scale, 50, &previous, nil, ranges)
	require.InDelta(t, 100, result.Automatic, 0.001, "the increase applies in full, but the final score never exceeds the scale maximum")
}

func TestComputeReportScoreManualOverrideWinsAsFinal(t *testing.T) {
	scale := domain.DefaultScale()
	previous := 70.0
	manual := 95.0

	result := domain.ComputeReportScore(scale, 60, &previous, &manual, nil)
	require.InDelta(t, 95, result.Final, 0.001)
	require.NotEqual(t, result.Automatic, result.Final, "the automatic value survives alongside the override")
}

func TestComputeReportScoreWarnsWhenFinalDropsBelowPrevious(t *testing.T) {
	scale := domain.DefaultScale()
	previous := 80.0
	manual := 70.0

	result := domain.ComputeReportScore(scale, 68, &previous, &manual, nil)
	require.Equal(t, domain.ReportWarningDanger, result.Warning)
	require.Contains(t, result.Warning.Message(&previous, result.Final), "Turun")
}

func TestComputeReportScoreWarnsWhenFinalStraysFromRaw(t *testing.T) {
	scale := domain.DefaultScale()
	manual := 65.0

	result := domain.ComputeReportScore(scale, 50, nil, &manual, nil)
	require.Equal(t, domain.ReportWarningNotice, result.Warning)
	require.Equal(t, "Selisih lebih dari 10 poin dari nilai murni", result.Warning.Message(nil, result.Final))
}

func TestComputeReportScoreNoWarningWhenClose(t *testing.T) {
	scale := domain.DefaultScale()
	previous := 60.0

	result := domain.ComputeReportScore(scale, 62, &previous, nil, nil)
	require.Equal(t, domain.ReportWarningNone, result.Warning)
	require.Equal(t, "OK", result.Warning.Message(&previous, result.Final))
}

func TestValidateGradeRangesRejectsOverlap(t *testing.T) {
	scale := domain.DefaultScale()
	ranges := []domain.GradeRange{
		{MinScore: 0, MaxScore: 60, IncreaseAmount: 2},
		{MinScore: 55, MaxScore: 100, IncreaseAmount: 3},
	}
	require.ErrorIs(t, domain.ValidateGradeRanges(scale, ranges), domain.ErrGradeRangeOverlap)
}

func TestValidateGradeRangesAcceptsAdjacentRanges(t *testing.T) {
	scale := domain.DefaultScale()
	ranges := []domain.GradeRange{
		{MinScore: 0, MaxScore: 59, IncreaseAmount: 2},
		{MinScore: 60, MaxScore: 100, IncreaseAmount: 3},
	}
	require.NoError(t, domain.ValidateGradeRanges(scale, ranges))
}

func TestValidateGradeRangesRejectsIncreaseAboveTen(t *testing.T) {
	scale := domain.DefaultScale()
	ranges := []domain.GradeRange{{MinScore: 0, MaxScore: 100, IncreaseAmount: 11}}
	require.ErrorIs(t, domain.ValidateGradeRanges(scale, ranges), domain.ErrInvalidInput, "the bound is a fixed 10, like the old app")
}

func TestValidateGradeRangesBoundIsFixedAtTenRegardlessOfScaleIncreaseMax(t *testing.T) {
	scale := domain.DefaultScale()
	scale.IncreaseMax = 15
	ranges := []domain.GradeRange{{MinScore: 0, MaxScore: 100, IncreaseAmount: 12}}
	require.ErrorIs(t, domain.ValidateGradeRanges(scale, ranges), domain.ErrInvalidInput, "scale.IncreaseMax no longer widens the bound, matching ComputeReportScore ignoring it too")

	scale.IncreaseMax = 3
	ranges = []domain.GradeRange{{MinScore: 0, MaxScore: 100, IncreaseAmount: 10}}
	require.NoError(t, domain.ValidateGradeRanges(scale, ranges), "scale.IncreaseMax no longer narrows the bound either")
}

func TestValidateGradeRangesRejectsOutOfScaleBounds(t *testing.T) {
	scale := domain.DefaultScale()
	ranges := []domain.GradeRange{{MinScore: -1, MaxScore: 50, IncreaseAmount: 1}}
	require.ErrorIs(t, domain.ValidateGradeRanges(scale, ranges), domain.ErrInvalidInput)
}

func TestValidateComponent(t *testing.T) {
	require.NoError(t, domain.ValidateComponent("UH1", "Ulangan harian", domain.KindFormative, 20, nil))

	kktp := 70.0
	require.NoError(t, domain.ValidateComponent("UH1", "", domain.KindFormative, 0, &kktp))

	require.ErrorIs(t, domain.ValidateComponent("", "", domain.KindFormative, 20, nil), domain.ErrInvalidInput, "code is required")

	longCode := make([]byte, 33)
	for i := range longCode {
		longCode[i] = 'A'
	}
	require.ErrorIs(t, domain.ValidateComponent(string(longCode), "", domain.KindFormative, 20, nil), domain.ErrInvalidInput, "code over 32 characters")

	require.ErrorIs(t, domain.ValidateComponent("UH1", "", "not-a-kind", 20, nil), domain.ErrInvalidInput)
	require.ErrorIs(t, domain.ValidateComponent("UH1", "", domain.KindFormative, 101, nil), domain.ErrInvalidInput, "weight over 100")
	require.ErrorIs(t, domain.ValidateComponent("UH1", "", domain.KindFormative, -1, nil), domain.ErrInvalidInput, "weight below 0")

	over100 := 101.0
	require.ErrorIs(t, domain.ValidateComponent("UH1", "", domain.KindFormative, 20, &over100), domain.ErrInvalidInput, "kktp over 100")
}

func TestScaleIsTPEligible(t *testing.T) {
	scale := domain.DefaultScale()
	require.True(t, scale.IsTPEligible(domain.KindFormative))
	require.False(t, scale.IsTPEligible(domain.KindProject), "no tenant TP kind configured beyond formative")

	scale.TPKind = domain.KindProject
	require.True(t, scale.IsTPEligible(domain.KindProject))
	require.False(t, scale.IsTPEligible(domain.KindSummative))
}

func TestTPResult(t *testing.T) {
	score := 80.0
	require.Equal(t, "T", domain.TPResult(&score, 75, 100))
	require.Equal(t, "R", domain.TPResult(&score, 0, 74))
	require.Equal(t, "", domain.TPResult(nil, 0, 100))
}

func TestValidateTPMapping(t *testing.T) {
	scale := domain.DefaultScale()
	require.NoError(t, domain.ValidateTPMapping(scale, domain.TPMapping{ExportCode: "TP1", RMin: 0, RMax: 74, TMin: 75, TMax: 100}))
	require.ErrorIs(t, domain.ValidateTPMapping(scale, domain.TPMapping{ExportCode: "", RMin: 0, RMax: 74, TMin: 75, TMax: 100}), domain.ErrInvalidInput)
	require.ErrorIs(t, domain.ValidateTPMapping(scale, domain.TPMapping{ExportCode: "TP1", RMin: 80, RMax: 74, TMin: 75, TMax: 100}), domain.ErrInvalidInput)
	require.ErrorIs(t, domain.ValidateTPMapping(scale, domain.TPMapping{ExportCode: "TP1", RMin: 0, RMax: 74, TMin: 75, TMax: 200}), domain.ErrInvalidInput)
}

func TestValidateStar(t *testing.T) {
	require.NoError(t, domain.ValidateStar(5, "kerja bagus"))
	require.NoError(t, domain.ValidateStar(-999, ""))
	require.ErrorIs(t, domain.ValidateStar(0, ""), domain.ErrInvalidInput, "amount is |delta|, and delta must not be zero")
	require.ErrorIs(t, domain.ValidateStar(1000, ""), domain.ErrInvalidInput, "amount over 999")

	longNote := make([]byte, 256)
	for i := range longNote {
		longNote[i] = 'x'
	}
	require.ErrorIs(t, domain.ValidateStar(1, string(longNote)), domain.ErrInvalidInput, "note over 255 characters")
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

	invalid = domain.DefaultScale()
	invalid.TPKind = "not-a-kind"
	require.Error(t, invalid.Validate())
}
