package mapping

import "testing"

func TestCleanName(t *testing.T) {
	cases := map[string]string{
		"  Siti   Nurhaliza ":  "Siti Nurhaliza",
		"Budi\tSantoso":        "Budi Santoso",
		"Ahmad":                "Ahmad",
		"":                     "",
		"  multiple   spaces ": "multiple spaces",
	}
	for in, want := range cases {
		if got := CleanName(in); got != want {
			t.Errorf("CleanName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCleanNumericID(t *testing.T) {
	cases := map[string]string{
		"00.91.23.45.67": "0091234567",
		" 12345 ":        "12345",
		"NISN-0099":      "0099",
		"":               "",
		"abc":            "",
	}
	for in, want := range cases {
		if got := CleanNumericID(in); got != want {
			t.Errorf("CleanNumericID(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCleanUsername(t *testing.T) {
	if got := CleanUsername(" Budi.S "); got != "budi.s" {
		t.Errorf("CleanUsername = %q, want %q", got, "budi.s")
	}
}

func TestMapGender(t *testing.T) {
	cases := []struct {
		code   string
		want   string
		wantOK bool
	}{
		{"L", "male", true},
		{"p", "female", true},
		{" P ", "female", true},
		{"X", "", false},
		{"", "", false},
	}
	for _, tc := range cases {
		got, ok := MapGender(tc.code)
		if got != tc.want || ok != tc.wantOK {
			t.Errorf("MapGender(%q) = (%q, %v), want (%q, %v)", tc.code, got, ok, tc.want, tc.wantOK)
		}
	}
}

func TestMapEmploymentStatus(t *testing.T) {
	cases := []struct {
		raw    string
		want   string
		wantOK bool
	}{
		{"PNS", "pns", true},
		{"Tetap", "tetap", true},
		{"HONORER", "honorer", true},
		{"Freelance", "", false},
	}
	for _, tc := range cases {
		got, ok := MapEmploymentStatus(tc.raw)
		if got != tc.want || ok != tc.wantOK {
			t.Errorf("MapEmploymentStatus(%q) = (%q, %v), want (%q, %v)", tc.raw, got, ok, tc.want, tc.wantOK)
		}
	}
}

func TestMapAttendanceStatus(t *testing.T) {
	cases := []struct {
		code   string
		want   string
		wantOK bool
	}{
		{"h", "H", true},
		{"S", "S", true},
		{"I", "I", true},
		{"D", "D", true},
		{"A", "A", true},
		{"Z", "", false},
		{"", "", false},
	}
	for _, tc := range cases {
		got, ok := MapAttendanceStatus(tc.code)
		if got != tc.want || ok != tc.wantOK {
			t.Errorf("MapAttendanceStatus(%q) = (%q, %v), want (%q, %v)", tc.code, got, ok, tc.want, tc.wantOK)
		}
	}
}
