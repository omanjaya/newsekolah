package domain

import "testing"

func TestDDCPrefix(t *testing.T) {
	cases := map[string]string{
		"":      "",
		"800":   "8",
		"000":   "0",
		"890":   "89",
		"899":   "899",
		"8":     "8",
		"80":    "80",
		" 900 ": "9",
	}
	for in, want := range cases {
		if got := DDCPrefix(in); got != want {
			t.Errorf("DDCPrefix(%q) = %q, want %q", in, got, want)
		}
	}
}
