package mapping

import "testing"

func TestMapDuty(t *testing.T) {
	cases := []struct {
		name     string
		wantSlug string
		wantOK   bool
	}{
		{"Wali Kelas X-A", DutyHomeroom, true},
		{"WALIKELAS XI IPA 1", DutyHomeroom, true},
		{"Guru BK", DutyCounselor, true},
		{"Bimbingan dan Konseling", DutyCounselor, true},
		{"Piket Harian", DutyPicket, true},
		{"Wakil Kepala Sekolah Kurikulum", DutyLeadership, true},
		{"Kepala Sekolah", DutyLeadership, true},
		{"Satpam", DutySecurity, true},
		{"Petugas Perpustakaan", DutyLibrarian, true},
		{"Bendahara Sekolah", "", false},
		{"", "", false},
	}
	for _, tc := range cases {
		slug, ok := MapDuty(tc.name)
		if slug != tc.wantSlug || ok != tc.wantOK {
			t.Errorf("MapDuty(%q) = (%q, %v), want (%q, %v)", tc.name, slug, ok, tc.wantSlug, tc.wantOK)
		}
	}
}
