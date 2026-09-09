package domain_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

func TestGradeLevelTemplateRows(t *testing.T) {
	cases := []struct {
		key       string
		wantCodes []string
	}{
		{domain.TemplateSD, []string{"1", "2", "3", "4", "5", "6"}},
		{domain.TemplateSMP, []string{"7", "8", "9"}},
		{domain.TemplateSMA, []string{"X", "XI", "XII"}},
		{domain.TemplateSMK, []string{"X", "XI", "XII"}},
	}

	for _, tc := range cases {
		t.Run(tc.key, func(t *testing.T) {
			rows, err := domain.GradeLevelTemplateRows(tc.key)
			require.NoError(t, err)
			require.Len(t, rows, len(tc.wantCodes))
			for i, code := range tc.wantCodes {
				require.Equal(t, code, rows[i].Code)
				require.Equal(t, int16(i+1), rows[i].Sequence) //nolint:gosec // small fixed test values
			}
		})
	}

	t.Run("unknown template", func(t *testing.T) {
		_, err := domain.GradeLevelTemplateRows("college")
		require.ErrorIs(t, err, domain.ErrUnknownTemplate)
	})

	t.Run("returned rows are a copy", func(t *testing.T) {
		rows, err := domain.GradeLevelTemplateRows(domain.TemplateSD)
		require.NoError(t, err)
		rows[0].Name = "mutated"

		fresh, err := domain.GradeLevelTemplateRows(domain.TemplateSD)
		require.NoError(t, err)
		require.NotEqual(t, "mutated", fresh[0].Name)
	})
}
