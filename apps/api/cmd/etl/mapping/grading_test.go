package mapping

import "testing"

func TestMapAssessmentKind(t *testing.T) {
	cases := []struct{ raw, want string }{
		{"TP", "formative"},
		{"tp", "formative"},
		{"Sumatif", "summative"},
		{"Praktik", "practical"},
		{"Lainnya", "other"},
		{"", "other"},
	}
	for _, tc := range cases {
		if got := MapAssessmentKind(tc.raw); got != tc.want {
			t.Errorf("MapAssessmentKind(%q) = %q, want %q", tc.raw, got, tc.want)
		}
	}
}
