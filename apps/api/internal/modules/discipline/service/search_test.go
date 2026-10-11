package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSearchTerm(t *testing.T) {
	cases := map[string]string{
		"":         "",
		"   ":      "",
		"a":        "",
		" a ":      "",
		"ab":       "ab",
		"  Budi  ": "Budi",
		"50%":      `50\%`,
		"a_b":      `a\_b`,
		`a\b`:      `a\\b`,
	}
	for in, want := range cases {
		require.Equal(t, want, SearchTerm(in), "input %q", in)
	}
}
