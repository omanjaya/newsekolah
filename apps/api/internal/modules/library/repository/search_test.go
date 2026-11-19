package repository

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPrefixTSQuery(t *testing.T) {
	cases := map[string]string{
		"Lask":           "lask:*",
		"laskar pel":     "laskar:* & pel:*",
		"  Sapiens!! ":   "sapiens:*",
		"o'brien & (x)":  "o:* & brien:* & x:*",
		"978-602":        "978:* & 602:*",
		"!!! ---":        "",
		"Bumi Manusia 2": "bumi:* & manusia:* & 2:*",
	}
	for in, want := range cases {
		require.Equal(t, want, prefixTSQuery(in), "input %q", in)
	}
}

func TestFulltextQueryNeedsThreeRunes(t *testing.T) {
	require.Empty(t, fulltextQuery("La"))
	require.Equal(t, "lask:*", fulltextQuery("Lask"))
	require.Empty(t, fulltextQuery("..."))
}
