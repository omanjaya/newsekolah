package mapping

import "testing"

func TestStripHTMLTags(t *testing.T) {
	cases := []struct{ raw, want string }{
		{"<p>Gerak melingkar</p>", "Gerak melingkar"},
		{"<p>A</p><p>B</p>", "A B"},
		{"plain text", "plain text"},
		{"  <b>bold</b>  spaced  ", "bold spaced"},
	}
	for _, tc := range cases {
		if got := StripHTMLTags(tc.raw); got != tc.want {
			t.Errorf("StripHTMLTags(%q) = %q, want %q", tc.raw, got, tc.want)
		}
	}
}

func TestTruncate(t *testing.T) {
	cases := []struct {
		s      string
		maxLen int
		want   string
	}{
		{"short", 10, "short"},
		{"exactly10!", 10, "exactly10!"},
		{"this is way too long", 10, "this is w…"},
	}
	for _, tc := range cases {
		if got := Truncate(tc.s, tc.maxLen); got != tc.want {
			t.Errorf("Truncate(%q, %d) = %q, want %q", tc.s, tc.maxLen, got, tc.want)
		}
		if runeLen := len([]rune(Truncate(tc.s, tc.maxLen))); runeLen > tc.maxLen {
			t.Errorf("Truncate(%q, %d) result has %d runes, want <= %d", tc.s, tc.maxLen, runeLen, tc.maxLen)
		}
	}
}
