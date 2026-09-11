package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
)

func date(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestSPPolicyLevelFor(t *testing.T) {
	policy := domain.DefaultSPPolicy()

	tests := []struct {
		name      string
		total     int
		wantLevel int
		wantFound bool
	}{
		{"below the first threshold", 24, 0, false},
		{"exactly the first threshold", 25, 1, true},
		{"between thresholds", 49, 1, true},
		{"third threshold", 80, 3, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			level, found := policy.LevelFor(tt.total)
			require.Equal(t, tt.wantFound, found)
			if tt.wantFound {
				require.Equal(t, tt.wantLevel, level.Level)
			}
		})
	}
}

func TestSPPolicyDueLevelsSkipsIssued(t *testing.T) {
	policy := domain.DefaultSPPolicy()

	due := policy.DueLevels(60, nil)
	require.Len(t, due, 2, "60 points reaches SP 1 and SP 2")
	require.Equal(t, 1, due[0].Level, "the lowest unissued level comes first")

	due = policy.DueLevels(60, []domain.WarningLetter{{Level: 1}})
	require.Len(t, due, 1)
	require.Equal(t, 2, due[0].Level)

	due = policy.DueLevels(60, []domain.WarningLetter{{Level: 1}, {Level: 2}})
	require.Empty(t, due)
}

func TestSPPolicyValidateRejectsBrokenLadders(t *testing.T) {
	tests := []struct {
		name   string
		levels []domain.SPLevel
	}{
		{"empty", nil},
		{"gap in levels", []domain.SPLevel{{Level: 1, MinPoints: 10, Label: "SP 1"}, {Level: 3, MinPoints: 20, Label: "SP 3"}}},
		{"thresholds not increasing", []domain.SPLevel{{Level: 1, MinPoints: 20, Label: "SP 1"}, {Level: 2, MinPoints: 20, Label: "SP 2"}}},
		{"missing label", []domain.SPLevel{{Level: 1, MinPoints: 20}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Error(t, domain.SPPolicy{Levels: tt.levels}.Validate())
		})
	}
	require.NoError(t, domain.DefaultSPPolicy().Validate())
}

func TestSPPolicyFirstCrossedDates(t *testing.T) {
	policy := domain.DefaultSPPolicy()

	// Out of order on purpose: FirstCrossedDates must sort before summing.
	records := []domain.PointRecord{
		{Points: 20, OccurredOn: date("2026-03-01")},
		{Points: 10, OccurredOn: date("2026-01-15")}, // total after sort: 30
		{Points: 20, OccurredOn: date("2026-02-01")}, // running total 10 -> 30 -> 50
	}

	crossed := policy.FirstCrossedDates(records)
	require.Equal(t, date("2026-02-01"), crossed[1], "SP1 (25 pts) is first reached on the day the running total hits 30")
	require.Equal(t, date("2026-03-01"), crossed[2], "SP2 (50 pts) is first reached once the last record lands")
	require.NotContains(t, crossed, 3, "SP3 (75 pts) was never reached")
}

func TestWarningLetterTemplatePolicyValidate(t *testing.T) {
	require.NoError(t, domain.DefaultWarningLetterTemplatePolicy().Validate())
	require.Error(t, domain.WarningLetterTemplatePolicy{NumberPattern: "", SeqPad: 3}.Validate())
	require.Error(t, domain.WarningLetterTemplatePolicy{NumberPattern: "{{seq}}", SeqPad: -1}.Validate())
}

func TestCounselingVisibility(t *testing.T) {
	author := domain.ReaderRole{IsAuthor: true}
	counselor := domain.ReaderRole{IsCounselor: true}
	leadership := domain.ReaderRole{IsLeadership: true}
	stranger := domain.ReaderRole{}

	private := domain.Counseling{Visibility: domain.VisibilityCounselor}
	require.True(t, private.VisibleTo(author), "the author always reads their own note")
	require.False(t, private.VisibleTo(counselor))
	require.False(t, private.VisibleTo(leadership))

	team := domain.Counseling{Visibility: domain.VisibilityBKTeam}
	require.True(t, team.VisibleTo(counselor))
	require.False(t, team.VisibleTo(leadership))

	shared := domain.Counseling{Visibility: domain.VisibilityLeadership}
	require.True(t, shared.VisibleTo(counselor))
	require.True(t, shared.VisibleTo(leadership))
	require.False(t, shared.VisibleTo(stranger))
}
