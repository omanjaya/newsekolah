package mapping

import "testing"

func TestStudentNaturalKey(t *testing.T) {
	cases := []struct {
		nisn, nis, username string
		wantKey, wantSource string
	}{
		{"00.91.23.45.67", "2026001", "budi", "0091234567", "nisn"},
		{"", "2026001", "budi", "2026001", "nis"},
		{"", "", "Budi", "budi", "username"},
	}
	for _, tc := range cases {
		key, source := StudentNaturalKey(tc.nisn, tc.nis, tc.username)
		if key != tc.wantKey || source != tc.wantSource {
			t.Errorf("StudentNaturalKey(%q,%q,%q) = (%q,%q), want (%q,%q)",
				tc.nisn, tc.nis, tc.username, key, source, tc.wantKey, tc.wantSource)
		}
	}
}

func TestStaffNaturalKey(t *testing.T) {
	key, source := StaffNaturalKey("198501012010011001", "guru1")
	if key != "198501012010011001" || source != "nip" {
		t.Errorf("StaffNaturalKey with nip = (%q,%q), want nip", key, source)
	}
	key, source = StaffNaturalKey("", "Guru1")
	if key != "guru1" || source != "username" {
		t.Errorf("StaffNaturalKey without nip = (%q,%q), want username fallback", key, source)
	}
}

func TestSlugCode(t *testing.T) {
	cases := map[string]string{
		"Bahasa Indonesia":        "BAHASA-INDONESIA",
		"Pendidikan Agama Islam!": "PENDIDIKAN-AGAMA-ISLAM",
		"":                        "X",
	}
	for in, want := range cases {
		if got := SlugCode(in, 40); got != want {
			t.Errorf("SlugCode(%q) = %q, want %q", in, got, want)
		}
	}
	if got := SlugCode("A Very Long Subject Name That Exceeds The Limit", 20); len(got) > 20 {
		t.Errorf("SlugCode exceeded maxLen: %q (%d chars)", got, len(got))
	}
}

func TestParseGradeFromClassName(t *testing.T) {
	cases := []struct {
		name     string
		wantCode string
		wantSeq  int16
		wantOK   bool
	}{
		{"X-A", "X", 10, true},
		{"XI IPA 1", "XI", 11, true},
		{"XII-IPS-2", "XII", 12, true},
		{"7B", "7", 7, true},
		{"9-A", "9", 9, true},
		{"Unggulan-1", "", 0, false},
		{"", "", 0, false},
	}
	for _, tc := range cases {
		code, seq, ok := ParseGradeFromClassName(tc.name)
		if code != tc.wantCode || seq != tc.wantSeq || ok != tc.wantOK {
			t.Errorf("ParseGradeFromClassName(%q) = (%q,%d,%v), want (%q,%d,%v)",
				tc.name, code, seq, ok, tc.wantCode, tc.wantSeq, tc.wantOK)
		}
	}
}

func TestMapDayOfWeek(t *testing.T) {
	cases := []struct {
		day    string
		want   int16
		wantOK bool
	}{
		{"monday", 1, true},
		{"Sunday", 7, true},
		{"funday", 0, false},
	}
	for _, tc := range cases {
		got, ok := MapDayOfWeek(tc.day)
		if got != tc.want || ok != tc.wantOK {
			t.Errorf("MapDayOfWeek(%q) = (%d,%v), want (%d,%v)", tc.day, got, ok, tc.want, tc.wantOK)
		}
	}
}

func TestClassNaturalKey(t *testing.T) {
	got := ClassNaturalKey("2026/2027", " X-A ")
	if want := "2026/2027/X-A"; got != want {
		t.Errorf("ClassNaturalKey = %q, want %q", got, want)
	}
}
