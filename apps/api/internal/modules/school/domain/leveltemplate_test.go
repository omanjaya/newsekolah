package domain

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLevelTemplateByKey_KnownKeys(t *testing.T) {
	for _, key := range []string{"sd", "smp", "sma", "smk"} {
		tpl, err := LevelTemplateByKey(key)
		require.NoError(t, err, key)
		require.Equal(t, LevelTemplateKey(key), tpl.Key)
		require.NotEmpty(t, tpl.GradeLevels, "%s grade levels", key)
		require.NotEmpty(t, tpl.Subjects, "%s subjects", key)
		require.NotEmpty(t, tpl.Periods, "%s periods", key)

		codes := map[string]bool{}
		for _, g := range tpl.GradeLevels {
			require.False(t, codes[g.Code], "duplicate grade level code %s in %s", g.Code, key)
			codes[g.Code] = true
			require.NotEmpty(t, g.Name)
			require.Positive(t, g.Sequence)
		}

		subjectCodes := map[string]bool{}
		for _, s := range tpl.Subjects {
			require.False(t, subjectCodes[s.Code], "duplicate subject code %s in %s", s.Code, key)
			subjectCodes[s.Code] = true
			require.NotEmpty(t, s.Name)
		}

		var lastEnd = -1
		for _, p := range tpl.Periods {
			start := p.StartHour*60 + p.StartMinute
			end := p.EndHour*60 + p.EndMinute
			require.Greater(t, end, start, "period %s in %s must end after it starts", p.Name, key)
			require.GreaterOrEqual(t, start, lastEnd, "period %s in %s overlaps the previous one", p.Name, key)
			lastEnd = end
		}
	}
}

func TestLevelTemplateByKey_UnknownKey(t *testing.T) {
	_, err := LevelTemplateByKey("college")
	require.ErrorIs(t, err, ErrUnknownLevelTemplate)
}

func TestLevelTemplateByKey_ReturnsACopy(t *testing.T) {
	tpl, err := LevelTemplateByKey("sd")
	require.NoError(t, err)

	tpl.GradeLevels[0].Name = "mutated"

	again, err := LevelTemplateByKey("sd")
	require.NoError(t, err)
	require.NotEqual(t, "mutated", again.GradeLevels[0].Name)
}

func TestLevelTemplateKeys(t *testing.T) {
	require.Equal(t, []LevelTemplateKey{LevelSD, LevelSMP, LevelSMA, LevelSMK}, LevelTemplateKeys())
}
