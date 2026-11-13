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
