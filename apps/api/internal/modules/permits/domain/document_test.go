package domain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestRenderNumberingTemplate(t *testing.T) {
	issuedAt := time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC)
	vars := NumberingVars(7, issuedAt)

	got := RenderNumberingTemplate(DefaultLeaveLetterNumberingTemplate, vars)
	require.Equal(t, "7/IZIN/III/2026", got)
}

func TestRenderNumberingTemplateCustom(t *testing.T) {
	issuedAt := time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)
	vars := NumberingVars(42, issuedAt)

	got := RenderNumberingTemplate("{{seq}}/SMA-X/{{month}}/{{year}}", vars)
	require.Equal(t, "42/SMA-X/12/2026", got)
}

func TestRenderNumberingTemplateUnknownPlaceholderLeftIntact(t *testing.T) {
	got := RenderNumberingTemplate("{{seq}}/{{unknown}}", NumberingVars(1, time.Now()))
	require.Contains(t, got, "{{unknown}}")
}

func TestMonthRoman(t *testing.T) {
	require.Equal(t, "I", MonthRoman(time.January))
	require.Equal(t, "XII", MonthRoman(time.December))
	require.Equal(t, "", MonthRoman(time.Month(0)))
	require.Equal(t, "", MonthRoman(time.Month(13)))
}
