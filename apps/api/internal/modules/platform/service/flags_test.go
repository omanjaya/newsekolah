package service

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
)

func TestEffectiveEnabled(t *testing.T) {
	stored := []domain.ModuleFlag{
		{Module: "library", Enabled: false},
		{Module: "grading", Enabled: true},
	}
	tests := []struct {
		name   string
		stored []domain.ModuleFlag
		module domain.Module
		want   bool
	}{
		{"stored off", stored, domain.ModuleLibrary, false},
		{"stored on", stored, domain.ModuleGrading, true},
		{"no row is on (opt-out)", stored, domain.ModuleDiscipline, true},
		{"no rows at all is on", nil, domain.ModuleLibrary, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, effectiveEnabled(tc.stored, tc.module))
		})
	}
}

func TestEffectiveFlags(t *testing.T) {
	t.Run("no rows: every module, in AllModules order, enabled", func(t *testing.T) {
		got := effectiveFlags(nil)
		require.Len(t, got, len(domain.AllModules))
		for i, f := range got {
			require.Equal(t, string(domain.AllModules[i]), f.Module)
			require.True(t, f.Enabled, f.Module)
		}
	})

	t.Run("stored rows win, unknown modules are dropped", func(t *testing.T) {
		got := effectiveFlags([]domain.ModuleFlag{
			{Module: "library", Enabled: false},
			{Module: "visitors", Enabled: false},
			{Module: "legacy_x", Enabled: false},
		})
		require.Len(t, got, len(domain.AllModules))
		for i, f := range got {
			require.Equal(t, string(domain.AllModules[i]), f.Module)
			require.Equal(t, f.Module != "library" && f.Module != "visitors", f.Enabled, f.Module)
			require.NotEqual(t, "legacy_x", f.Module)
		}
	})
}
