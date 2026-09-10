package domain_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
)

func TestScore_NoSignals_IsNone(t *testing.T) {
	result := domain.Score(domain.Signals{}, domain.DefaultPolicy())

	require.Equal(t, domain.LevelNone, result.Level)
	require.Equal(t, 0, result.Score)
	require.Empty(t, result.Reasons)
}

func TestScore_MissingSignal_NeverContributes(t *testing.T) {
	// HasAttendance and HasGradeTrend are both false: even though the
	// zero-valued fields (AbsentDays, ConsideredDays, averages) would
	// otherwise compute a rate, the scorer must not invent a signal the
	// data cannot support.
	result := domain.Score(domain.Signals{
		AbsentDays: 20, ConsideredDays: 20,
		PreviousAverage: 90, CurrentAverage: 40,
	}, domain.DefaultPolicy())

	require.Equal(t, domain.LevelNone, result.Level)
	require.Empty(t, result.Reasons)
}

func TestScore_Attendance_Thresholds(t *testing.T) {
	policy := domain.DefaultPolicy()

	tests := []struct {
		name       string
		absent     int
		considered int
		wantReason bool
		wantCode   domain.ReasonCode
	}{
		{"below watch", 2, 20, false, ""},
		{"at watch boundary", 3, 20, true, domain.ReasonAttendanceWatch}, // 15%
		{"at risk boundary", 5, 20, true, domain.ReasonAttendanceAtRisk}, // 25%
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := domain.Score(domain.Signals{
				HasAttendance: true, AbsentDays: tc.absent, ConsideredDays: tc.considered,
			}, policy)
			if !tc.wantReason {
				require.Empty(t, result.Reasons)
				return
			}
			require.Len(t, result.Reasons, 1)
			require.Equal(t, tc.wantCode, result.Reasons[0].Code)
			require.Equal(t, tc.absent, result.Reasons[0].Params["absent_days"])
			require.Equal(t, tc.considered, result.Reasons[0].Params["considered_days"])
		})
	}
}

func TestScore_Discipline_Thresholds(t *testing.T) {
	policy := domain.DefaultPolicy()

	watch := domain.Score(domain.Signals{DisciplinePoints: 25}, policy)
	require.Len(t, watch.Reasons, 1)
	require.Equal(t, domain.ReasonDisciplineWatch, watch.Reasons[0].Code)

	atRisk := domain.Score(domain.Signals{DisciplinePoints: 50}, policy)
	require.Len(t, atRisk.Reasons, 1)
	require.Equal(t, domain.ReasonDisciplineAtRisk, atRisk.Reasons[0].Code)
	require.Greater(t, atRisk.Score, watch.Score)
}

func TestScore_WarningLetters_Thresholds(t *testing.T) {
	policy := domain.DefaultPolicy()

	none := domain.Score(domain.Signals{WarningLetterCount: 0}, policy)
	require.Empty(t, none.Reasons)

	watch := domain.Score(domain.Signals{WarningLetterCount: 1}, policy)
	require.Len(t, watch.Reasons, 1)
	require.Equal(t, domain.ReasonWarningLetterWatch, watch.Reasons[0].Code)

	atRisk := domain.Score(domain.Signals{WarningLetterCount: 2}, policy)
	require.Len(t, atRisk.Reasons, 1)
	require.Equal(t, domain.ReasonWarningLetterRisk, atRisk.Reasons[0].Code)
}

func TestScore_GradeTrend_RequiresPreviousTerm(t *testing.T) {
	policy := domain.DefaultPolicy()

	// A 50-point drop with HasGradeTrend false (no previous term on
	// record, e.g. the student's first term) must not be scored.
	noTrend := domain.Score(domain.Signals{PreviousAverage: 90, CurrentAverage: 40}, policy)
	require.Empty(t, noTrend.Reasons)

	withTrend := domain.Score(domain.Signals{HasGradeTrend: true, PreviousAverage: 90, CurrentAverage: 40}, policy)
	require.Len(t, withTrend.Reasons, 1)
	require.Equal(t, domain.ReasonGradeDropAtRisk, withTrend.Reasons[0].Code)

	// A rising average is not a drop and must not be flagged.
	improved := domain.Score(domain.Signals{HasGradeTrend: true, PreviousAverage: 70, CurrentAverage: 85}, policy)
	require.Empty(t, improved.Reasons)
}

func TestScore_CombinedSignals_ReachAtRisk(t *testing.T) {
	policy := domain.DefaultPolicy()

	// Three watch-level signals (half weight each: 20 + 15 + 7 = 42) cross
	// the watch cutoff of 40, though no single one of them would alone.
	result := domain.Score(domain.Signals{
		HasAttendance: true, AbsentDays: 3, ConsideredDays: 20, // watch: +20
		DisciplinePoints:   25, // watch: +15
		WarningLetterCount: 1,  // watch: +7 (15/2, floored)
	}, policy)
	require.Equal(t, domain.LevelWatch, result.Level)
	require.Equal(t, 42, result.Score)
	require.Len(t, result.Reasons, 3)

	// Neither signal alone reaches "at risk" (attendance at its at-risk
	// rate scores 40, exactly the watch cutoff; discipline at its at-risk
	// point total scores 30, below even the watch cutoff), but together
	// they cross AtRiskScore=70 -- proving the top level is reachable
	// through combination, not only through one dominant signal.
	atRisk := domain.Score(domain.Signals{
		HasAttendance: true, AbsentDays: 5, ConsideredDays: 20, // at risk: +40
		DisciplinePoints: 50, // at risk: +30
	}, policy)
	require.Equal(t, domain.LevelAtRisk, atRisk.Level)
	require.Equal(t, 70, atRisk.Score)
	require.Len(t, atRisk.Reasons, 2)
}

func TestScore_ReasonsSortedByWeightDescending(t *testing.T) {
	policy := domain.DefaultPolicy()

	result := domain.Score(domain.Signals{
		DisciplinePoints:   25,                                      // weight 15
		WarningLetterCount: 2,                                       // weight 15 (full, at risk)
		HasAttendance:      true, AbsentDays: 5, ConsideredDays: 20, // weight 40
	}, policy)

	require.Len(t, result.Reasons, 3)
	for i := 1; i < len(result.Reasons); i++ {
		require.GreaterOrEqual(t, result.Reasons[i-1].Weight, result.Reasons[i].Weight)
	}
}

func TestDefaultPolicy_IsValid(t *testing.T) {
	require.NoError(t, domain.DefaultPolicy().Validate())
}

func TestPolicy_Validate(t *testing.T) {
	valid := domain.DefaultPolicy()

	tests := []struct {
		name    string
		mutate  func(p domain.Policy) domain.Policy
		wantErr bool
	}{
		{"valid default", func(p domain.Policy) domain.Policy { return p }, false},
		{"zero window", func(p domain.Policy) domain.Policy { p.WindowDays = 0; return p }, true},
		{"attendance watch not below at-risk", func(p domain.Policy) domain.Policy {
			p.AttendanceWatchRate = 0.3
			return p
		}, true},
		{"discipline watch not below at-risk", func(p domain.Policy) domain.Policy {
			p.DisciplineWatchPoints = 60
			return p
		}, true},
		{"warning letter counts not increasing", func(p domain.Policy) domain.Policy {
			p.WarningLetterAtRiskCount = p.WarningLetterWatchCount
			return p
		}, true},
		{"grade drop thresholds not increasing", func(p domain.Policy) domain.Policy {
			p.GradeDropAtRiskPoints = p.GradeDropWatchPoints
			return p
		}, true},
		{"zero weight", func(p domain.Policy) domain.Policy { p.GradeWeight = 0; return p }, true},
		{"score cutoffs not increasing", func(p domain.Policy) domain.Policy {
			p.AtRiskScore = p.WatchScore
			return p
		}, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.mutate(valid).Validate()
			if tc.wantErr {
				require.ErrorIs(t, err, domain.ErrInvalidPolicy)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestLevel_Valid(t *testing.T) {
	require.True(t, domain.LevelNone.Valid())
	require.True(t, domain.LevelWatch.Valid())
	require.True(t, domain.LevelAtRisk.Valid())
	require.False(t, domain.Level("unknown").Valid())
}
