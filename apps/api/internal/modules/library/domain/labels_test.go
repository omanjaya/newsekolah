package domain

import "testing"

func TestLabelPosition(t *testing.T) {
	cases := []struct {
		index int
		wantX float64
		wantY float64
	}{
		{0, 0, 8.5},
		{1, 70, 8.5},
		{2, 140, 8.5},
		{3, 0, 33.5},
		{23, 140, 8.5 + 7*25},
	}
	for _, c := range cases {
		x, y := LabelPosition(c.index)
		if x != c.wantX || y != c.wantY {
			t.Errorf("LabelPosition(%d) = (%v, %v), want (%v, %v)", c.index, x, y, c.wantX, c.wantY)
		}
	}
}

func TestLabelCallNumberLines(t *testing.T) {
	cases := []struct {
		callNumber string
		want       []string
	}{
		{"", nil},
		{"583.8", []string{"583.8"}},
		{"583.8 SUP r", []string{"583.8", "SUP", "r"}},
		{"583.8 SUP r Extra", []string{"583.8", "SUP", "r"}},
	}
	for _, c := range cases {
		got := LabelCallNumberLines(c.callNumber)
		if len(got) != len(c.want) {
			t.Fatalf("LabelCallNumberLines(%q) = %v, want %v", c.callNumber, got, c.want)
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("LabelCallNumberLines(%q)[%d] = %q, want %q", c.callNumber, i, got[i], c.want[i])
			}
		}
	}
}
